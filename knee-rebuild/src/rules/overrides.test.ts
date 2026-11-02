import { describe, expect, it } from 'vitest'
import { program, templateFor } from '../program/program.ts'
import { CUE_MAX, Cue, ProgramOverride, type Exercise, type Slot } from '../schema/index.ts'
import {
  addableSubstitutions,
  applyOverrides,
  applyToTemplate,
  cleanCue,
  cueLength,
  cueProblem,
  editedParts,
  insertItem,
  moveItem,
  overrideFor,
  overrideProblems,
  overridesBySlot,
  removeItem,
  replaceItem,
  slotEdit,
  withCueAdded,
  withSubstitutionAdded,
} from './overrides.ts'

// Phase 1 Session A, slot 1 as program.md writes it: the leg press, then the 45° press, the Smith box squat, the goblet squat.
const legPress = (): Slot => structuredClone(templateFor(1, 'A').slots.find((s) => s.id === 'p1a-1') as Slot)
const KNOWN: ReadonlySet<string> = new Set(program.exercises.map((e) => e.id))
const BY_ID: ReadonlyMap<string, Exercise> = new Map(program.exercises.map((e) => [e.id, e]))
const row = (over: Partial<ProgramOverride>): ProgramOverride => ProgramOverride.parse({ slotId: 'p1a-1', editedOn: '2026-11-16', ...over })

describe('the seed slot this file leans on', () => {
  it('is the leg press with one cue and three substitutions', () => {
    const slot = legPress()
    expect(slot.exerciseId).toBe('leg-press')
    expect(slot.cues).toHaveLength(1)
    expect(slot.substitutionIds).toEqual(['leg-press-45', 'smith-box-squat', 'goblet-squat-bench'])
  })
})

describe('applyOverrides', () => {
  it('is program.md’s slot when there is no override', () => {
    const slot = legPress()
    expect(applyOverrides(slot, undefined)).toEqual(slot)
  })

  it('replaces the cues and the substitutions an override sets, and nothing else', () => {
    const slot = legPress()
    const applied = applyOverrides(slot, row({ cues: ['Feet high', 'Lower for 3 s'], substitutionIds: ['goblet-squat-bench', 'smith-box-squat'] }))
    expect(applied).toEqual({ ...slot, cues: ['Feet high', 'Lower for 3 s'], substitutionIds: ['goblet-squat-bench', 'smith-box-squat'] })
  })

  it('keeps program.md’s list for the part the override leaves alone', () => {
    const slot = legPress()
    expect(applyOverrides(slot, row({ cues: [] }))).toEqual({ ...slot, cues: [] })
    expect(applyOverrides(slot, row({ substitutionIds: [] }))).toEqual({ ...slot, substitutionIds: [] })
  })

  it('never writes the seed slot, and shares no list with the override', () => {
    const slot = legPress()
    const before = structuredClone(slot)
    const override = row({ cues: ['Feet high'], substitutionIds: ['smith-box-squat'] })
    const applied = applyOverrides(slot, override)
    applied.cues.push('extra')
    applied.substitutionIds.push('leg-press-45')
    expect(slot).toEqual(before)
    expect(override.cues).toEqual(['Feet high'])
    expect(override.substitutionIds).toEqual(['smith-box-squat'])
    // The live seed itself is untouched too.
    applyOverrides(templateFor(1, 'A').slots[0] as Slot, override)
    expect(templateFor(1, 'A').slots[0]).toEqual(before)
  })

  it('ignores an override for another slot', () => {
    const slot = legPress()
    expect(applyOverrides(slot, row({ slotId: 'p1a-2', cues: ['Not mine'] }))).toEqual(slot)
  })

  it('drops the slot’s own exercise and repeats from the substitutions, and with the catalog given, ids it no longer has', () => {
    const slot = legPress()
    const stored = { slotId: 'p1a-1', substitutionIds: ['leg-press', 'retired-press', 'smith-box-squat'], editedOn: '2026-11-16' }
    expect(applyOverrides(slot, stored, KNOWN).substitutionIds).toEqual(['smith-box-squat'])
    expect(applyOverrides(slot, stored).substitutionIds).toEqual(['retired-press', 'smith-box-squat'])
  })
})

describe('applyToTemplate and overridesBySlot', () => {
  it('lays each slot’s override over it, by slot id, and leaves the template as written', () => {
    const template = templateFor(1, 'A')
    const before = structuredClone(template)
    const overrides = overridesBySlot([row({ cues: ['Feet high'] }), row({ slotId: 'p1a-2', substitutionIds: ['lying-leg-curl'] })])
    const applied = applyToTemplate(template, overrides, KNOWN)
    expect(applied.slots[0]?.cues).toEqual(['Feet high'])
    expect(applied.slots[1]?.substitutionIds).toEqual(['lying-leg-curl'])
    expect(applied.slots.slice(2)).toEqual(template.slots.slice(2))
    expect(template).toEqual(before)
  })

  it('keeps the last row for a slot listed twice', () => {
    const overrides = overridesBySlot([row({ cues: ['First'] }), row({ cues: ['Second'] })])
    expect(overrides.get('p1a-1')?.cues).toEqual(['Second'])
    expect(overrides.size).toBe(1)
  })
})

describe('slotEdit and editedParts', () => {
  it('starts the editor from the lists as they run', () => {
    const slot = legPress()
    expect(slotEdit(slot, undefined)).toEqual({ cues: slot.cues, substitutionIds: slot.substitutionIds })
    expect(slotEdit(slot, row({ substitutionIds: ['smith-box-squat'] }), KNOWN)).toEqual({ cues: slot.cues, substitutionIds: ['smith-box-squat'] })
  })

  it('says which part is edited, comparing what runs with what program.md says', () => {
    const slot = legPress()
    expect(editedParts(slot, undefined)).toEqual({ cues: false, substitutions: false })
    expect(editedParts(slot, row({ cues: ['Feet high'] }))).toEqual({ cues: true, substitutions: false })
    expect(editedParts(slot, row({ substitutionIds: ['smith-box-squat', 'leg-press-45', 'goblet-squat-bench'] }))).toEqual({ cues: false, substitutions: true })
    // A row that comes to program.md’s own lists (program.md caught up with it) is not an edit.
    expect(editedParts(slot, row({ cues: [...slot.cues], substitutionIds: [...slot.substitutionIds] }))).toEqual({ cues: false, substitutions: false })
    // Nor is a list that only differs by an id the catalog no longer has.
    expect(editedParts(slot, { slotId: 'p1a-1', substitutionIds: [...slot.substitutionIds, 'retired-press'], editedOn: '2026-11-16' }, KNOWN)).toEqual({ cues: false, substitutions: false })
  })
})

describe('overrideFor', () => {
  it('keeps only the part that differs from program.md, cleaned', () => {
    const slot = legPress()
    expect(overrideFor(slot, { cues: ['  Feet   high '], substitutionIds: slot.substitutionIds }, '2026-11-16')).toEqual({ slotId: 'p1a-1', cues: ['Feet high'], editedOn: '2026-11-16' })
    expect(overrideFor(slot, { cues: slot.cues, substitutionIds: ['smith-box-squat'] }, '2026-11-17')).toEqual({ slotId: 'p1a-1', substitutionIds: ['smith-box-squat'], editedOn: '2026-11-17' })
    expect(overrideFor(slot, { cues: [], substitutionIds: [] }, '2026-11-17')).toEqual({ slotId: 'p1a-1', cues: [], substitutionIds: [], editedOn: '2026-11-17' })
  })

  it('is null when the edit comes back to program.md’s own lists: the row goes', () => {
    const slot = legPress()
    expect(overrideFor(slot, { cues: [...slot.cues], substitutionIds: [...slot.substitutionIds] }, '2026-11-16')).toBeNull()
  })

  it('gives a row the schema takes', () => {
    const slot = legPress()
    const made = overrideFor(slot, { cues: ['Feet high'], substitutionIds: ['goblet-squat-bench'] }, '2026-11-16')
    expect(ProgramOverride.parse(made)).toEqual(made)
  })
})

describe('cues: cleanCue and cueProblem', () => {
  it('turns every run of spaces and line breaks into one space and trims the ends', () => {
    expect(cleanCue('  Feet high\n\nlower  for 3 s\t')).toBe('Feet high lower for 3 s')
  })

  it('takes 1 to 200 characters that show something, and says what is wrong otherwise', () => {
    expect(cueProblem('Feet high')).toBeNull()
    expect(cueProblem('x'.repeat(CUE_MAX))).toBeNull()
    expect(cueProblem('   ')).toBe('A cue needs at least one word.')
    expect(cueProblem('​')).toBe('A cue needs at least one word.')
    expect(cueProblem('x'.repeat(214))).toBe('A cue runs to 200 characters; this one is 214.')
    // Measured after cleaning, as it would be stored.
    expect(cueProblem(`  ${'x'.repeat(CUE_MAX)}  `)).toBeNull()
  })

  it('counts characters as the schema stores them: an emoji is one character, not two', () => {
    expect(cueLength('Feet high 💪')).toBe(11)
    expect(cueProblem('💪'.repeat(150))).toBeNull()
    expect(cueProblem('💪'.repeat(CUE_MAX))).toBeNull()
    expect(cueProblem('💪'.repeat(201))).toBe('A cue runs to 200 characters; this one is 201.')
  })

  it('turns a control character into a space, as a line break is: a pasted cue is one line of plain text', () => {
    expect(cleanCue('Knees out\u0007now')).toBe('Knees out now')
    expect(cleanCue('Lower\u0085for 3 s\u0000')).toBe('Lower for 3 s')
    expect(cueProblem('\u0007\u001b')).toBe('A cue needs at least one word.')
  })

  it('takes exactly the cues the schema stores: what it passes parses, cleaned, and what it refuses would not', () => {
    const typed = [
      'Feet high',
      '  Feet   high  ',
      'Lower\nfor 3 s',
      'Knees out\u0007now',
      'a\u0085b',
      '\u0000',
      '   ',
      '​',
      '💪'.repeat(CUE_MAX),
      '💪'.repeat(CUE_MAX + 1),
      'x'.repeat(CUE_MAX),
      `${'x'.repeat(CUE_MAX)} `,
      'x'.repeat(CUE_MAX + 1),
      'Stop at 90°; RPE 6→7; 10–12',
    ]
    for (const text of typed) {
      const stored = Cue.safeParse(cleanCue(text))
      expect({ text, takes: cueProblem(text) === null }).toEqual({ text, takes: stored.success })
      if (stored.success) expect(stored.data).toBe(cleanCue(text))
    }
  })

  it('keeps every cue program.md writes as it is, so editing one cue never rewrites or refuses another', () => {
    for (const cue of program.templates.flatMap((t) => t.slots.flatMap((s) => s.cues))) {
      expect(cleanCue(cue)).toBe(cue)
      expect(cueProblem(cue)).toBeNull()
    }
  })
})

describe('overrideProblems: what the repo refuses before a row reaches the phone', () => {
  it('passes an edit of exercises from the catalog', () => {
    expect(overrideProblems(legPress(), row({ cues: ['Feet high'], substitutionIds: ['goblet-squat-bench', 'single-leg-leg-press'] }), BY_ID)).toEqual([])
  })

  it('refuses another slot’s row, an exercise not in the catalog, the slot’s own exercise and a repeat', () => {
    const slot = legPress()
    expect(overrideProblems(slot, row({ slotId: 'p1a-2', cues: [] }), BY_ID)).toEqual(['That edit is for slot p1a-2, not p1a-1.'])
    const stored = { slotId: 'p1a-1', substitutionIds: ['leg-press', 'kettlebell-swing', 'smith-box-squat', 'smith-box-squat'], editedOn: '2026-11-16' }
    expect(overrideProblems(slot, stored, BY_ID)).toEqual([
      'Leg press, both legs is this slot’s own exercise, so it is never its substitution.',
      'kettlebell-swing is not in the program’s catalog; substitutions come from the catalog only.',
      'Smith machine box squat is listed twice.',
    ])
  })

  it('refuses a cue the screen should have refused', () => {
    const stored = { slotId: 'p1a-1', cues: ['Feet high', ' ', 'x'.repeat(201)], editedOn: '2026-11-16' }
    expect(overrideProblems(legPress(), stored, BY_ID)).toEqual(['Cue 2: A cue needs at least one word.', 'Cue 3: A cue runs to 200 characters; this one is 201.'])
  })
})

describe('list edits', () => {
  const list = ['a', 'b', 'c'] as const

  it('moves an item up or down one place, and leaves the ends where they are', () => {
    expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(list, 2, 1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(list, 5, 1)).toEqual(['a', 'b', 'c'])
  })

  it('removes, inserts (clamped to the list) and replaces, never in place', () => {
    expect(removeItem(list, 1)).toEqual(['a', 'c'])
    expect(removeItem(list, 3)).toEqual(['a', 'b', 'c'])
    expect(insertItem(list, 1, 'x')).toEqual(['a', 'x', 'b', 'c'])
    expect(insertItem(list, 9, 'x')).toEqual(['a', 'b', 'c', 'x'])
    expect(insertItem(list, -1, 'x')).toEqual(['x', 'a', 'b', 'c'])
    expect(replaceItem(list, 2, 'x')).toEqual(['a', 'b', 'x'])
    expect(replaceItem(list, 3, 'x')).toEqual(['a', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('adds a cue at the end, cleaned', () => {
    expect(withCueAdded({ cues: ['Feet high'], substitutionIds: [] }, ' Lower\nfor 3 s ')).toEqual({ cues: ['Feet high', 'Lower for 3 s'], substitutionIds: [] })
  })

  it('adds a substitution at the end, once, and never the slot’s own exercise', () => {
    const slot = legPress()
    const edit = slotEdit(slot, undefined)
    expect(withSubstitutionAdded(slot, edit, 'single-leg-leg-press').substitutionIds).toEqual([...slot.substitutionIds, 'single-leg-leg-press'])
    expect(withSubstitutionAdded(slot, edit, 'smith-box-squat')).toEqual(edit)
    expect(withSubstitutionAdded(slot, edit, 'leg-press')).toEqual(edit)
  })
})

describe('addableSubstitutions', () => {
  // Phase 1 Session A, slot 5: the hip abductor machine, then cable abduction, band walks, the Copenhagen plank.
  const abductor = (): Slot => structuredClone(templateFor(1, 'A').slots.find((s) => s.id === 'p1a-5') as Slot)

  it('offers every catalog exercise but the slot’s own and those listed, its own pattern first in catalog order', () => {
    const slot = abductor()
    const { samePattern, others } = addableSubstitutions(slot, slotEdit(slot, undefined), program.exercises)
    expect(samePattern.map((e) => e.id)).toEqual(['smith-hip-thrust', 'db-glute-bridge', 'db-hip-thrust', 'single-leg-hip-thrust', 'hip-adductor-machine', 'cable-hip-adduction', 'copenhagen-plank-long'])
    expect(samePattern.length + others.length).toBe(program.exercises.length - 4)
    expect(others.some((e) => e.pattern === 'hip')).toBe(false)
  })

  it('groups the rest by pattern, in the order patterns first appear in the catalog, catalog order inside each', () => {
    const slot = abductor()
    const { others } = addableSubstitutions(slot, slotEdit(slot, undefined), program.exercises)
    const patterns = [...new Set(others.map((e) => e.pattern))]
    expect(patterns).toEqual([...new Set(program.exercises.map((e) => e.pattern))].filter((p) => p !== 'hip'))
    expect(others).toEqual(patterns.flatMap((p) => program.exercises.filter((e) => e.pattern === p)))
  })

  it('offers an exercise again once it is removed from the list, and never the slot’s own', () => {
    const slot = legPress()
    const { samePattern } = addableSubstitutions(slot, { cues: [], substitutionIds: [] }, program.exercises)
    expect(samePattern.map((e) => e.id)).toEqual(['leg-press-45', 'smith-box-squat', 'goblet-squat-bench'])
    expect(addableSubstitutions(slot, slotEdit(slot, undefined), program.exercises).samePattern).toEqual([])
  })
})
