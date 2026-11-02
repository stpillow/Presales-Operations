import { describe, expect, it } from 'vitest'
import { program, templateFor } from '../program/program.ts'
import { parseInline, type Block } from '../rules/markdown.ts'
import { Settings, type ProgramOverride, type Slot } from '../schema/index.ts'
import {
  CUE_COUNT_FROM,
  addSections,
  cueCountWords,
  editedDetail,
  editorView,
  exerciseName,
  groupWords,
  patternWords,
  phaseScreen,
  removedWords,
  tableLayout,
} from './Program.helpers.ts'

const settingsIn = (over: Partial<Settings> = {}): Settings =>
  Settings.parse({ injuredSide: program.injuredSide, startDate: '2026-11-02', dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, ...over })
const edit = (over: Partial<ProgramOverride>): ProgramOverride => ({ slotId: 'p1a-1', editedOn: '2026-11-16', ...over }) as ProgramOverride
const seedSlot = (templateId: string, slotId: string): Slot => {
  const slot = program.templates.find((t) => t.id === templateId)?.slots.find((s) => s.id === slotId)
  if (!slot) throw new Error(`no slot ${slotId}`)
  return slot
}

describe('phaseScreen: this phase, as it runs this week', () => {
  it('Phase 1 in week 2: its three sessions, every slot with its label, exercise, prescription verbatim, cues and substitutions in order', () => {
    const screen = phaseScreen(settingsIn(), '2026-11-10', [])
    expect(screen.lead).toBe('Phase 1, Foundation: week 2 of the phase. Read-only until you tap Edit on a slot.')
    expect(screen.notWritten).toBeNull()
    expect(screen.sessions.map((s) => s.heading)).toEqual(['Session A', 'Session B', 'Session C'])
    const legPress = screen.sessions[0]?.rows[0]
    expect(legPress).toMatchObject({
      id: 'p1a-1',
      label: '1',
      exerciseName: 'Leg press, both legs',
      prescriptionText: '3 × 10–12, RPE 6→7',
      cues: ['Feet high and shoulder-width; lower for 3 s; stop at 90° or wherever pain stays at 3 or under; no hard lockout'],
      substitutions: ['45° leg press', 'Smith machine box squat', 'Goblet squat to a bench'],
      edited: false,
    })
    expect(screen.sessions[0]?.rows.map((r) => r.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('shows only the slots that run this week of the phase: snap-downs join Phase 2 from its third week', () => {
    const phaseTwo = settingsIn({ currentPhase: 2, phaseEnteredWeek: 4 })
    expect(phaseScreen(phaseTwo, '2026-11-23', []).sessions[0]?.rows.some((r) => r.label === 'prep')).toBe(false)
    expect(phaseScreen(phaseTwo, '2026-12-07', []).sessions[0]?.rows[0]?.label).toBe('prep')
  })

  it('before the start date it reads week 1 of the phase', () => {
    expect(phaseScreen(settingsIn(), '2026-10-30', []).lead).toBe('Phase 1, Foundation: week 1 of the phase. Read-only until you tap Edit on a slot.')
  })

  it('an edited slot runs Shawn’s lists and says Edited; the rest stay program.md’s', () => {
    const screen = phaseScreen(settingsIn(), '2026-11-10', [edit({ cues: ['Feet high'], substitutionIds: ['goblet-squat-bench'] })])
    const [first, second] = screen.sessions[0]?.rows ?? []
    expect(first).toMatchObject({ cues: ['Feet high'], substitutions: ['Goblet squat to a bench'], edited: true })
    expect(second?.edited).toBe(false)
  })

  it('names a superset’s other slots, and says when a slot is optional', () => {
    const rows = phaseScreen(settingsIn(), '2026-11-10', []).sessions[0]?.rows ?? []
    expect(rows.find((r) => r.label === '5')?.notes).toEqual(['Grouped with 6 and 7.'])
    expect(rows.find((r) => r.label === '9')?.notes).toEqual(['Optional.'])
    expect(rows.find((r) => r.label === '1')?.notes).toEqual([])
  })

  it('Phase 4: no sessions, said in words', () => {
    const screen = phaseScreen(settingsIn({ currentPhase: 4, phaseEnteredWeek: 13 }), '2027-01-25', [])
    expect(screen.sessions).toEqual([])
    expect(screen.lead).toBe('Phase 4, Lacrosse.')
    expect(screen.notWritten).toBe('Phase 4’s sessions are not written yet; program.md says they come once Gate 3 is clean. Its preview is under program.md.')
  })
})

describe('groupWords', () => {
  it('names the other members of a group, in session order', () => {
    const slots = templateFor(1, 'A').slots
    expect(groupWords(slots[4] as Slot, slots)).toBe('Grouped with 6 and 7.')
    expect(groupWords(slots[5] as Slot, slots)).toBe('Grouped with 5 and 7.')
    expect(groupWords(slots[0] as Slot, slots)).toBeNull()
  })

  it('a group with one other member this week names just it', () => {
    const slots = templateFor(1, 'B').slots
    expect(groupWords(slots.find((s) => s.label === '7') as Slot, slots)).toBe('Grouped with 8.')
  })
})

describe('editorView: what the editor shows for a slot', () => {
  it('a slot as program.md writes it: no Edited line, no Back to program.md’s', () => {
    const view = editorView(seedSlot('p1-a', 'p1a-1'), undefined)
    expect(view.edit).toEqual({ cues: seedSlot('p1-a', 'p1a-1').cues, substitutionIds: seedSlot('p1-a', 'p1a-1').substitutionIds })
    expect(view.substitutions.map((s) => s.name)).toEqual(['45° leg press', 'Smith machine box squat', 'Goblet squat to a bench'])
    expect(view.edited).toEqual({ cues: false, substitutions: false })
    expect(view.detail).toBeNull()
    expect(view.writtenCues).toBeNull()
    expect(view.writtenSubstitutions).toBeNull()
  })

  it('an edited slot says what is Shawn’s and since when, and keeps program.md’s lists beside it', () => {
    const view = editorView(seedSlot('p1-a', 'p1a-1'), edit({ substitutionIds: ['goblet-squat-bench', 'smith-box-squat'] }))
    expect(view.detail).toBe('Edited Nov 16: your substitutions, program.md’s cues.')
    expect(view.writtenCues).toBeNull()
    expect(view.writtenSubstitutions).toEqual(['45° leg press', 'Smith machine box squat', 'Goblet squat to a bench'])
  })
})

describe('exerciseName', () => {
  it('names an exercise from the catalog, and falls back to its id', () => {
    expect(exerciseName('smith-box-squat')).toBe('Smith machine box squat')
    expect(exerciseName('retired-press')).toBe('retired-press')
  })
})

describe('editedDetail', () => {
  it('says which lists are Shawn’s, in words', () => {
    expect(editedDetail({ cues: true, substitutions: false }, '2026-11-16')).toBe('Edited Nov 16: your cues, program.md’s substitutions.')
    expect(editedDetail({ cues: true, substitutions: true }, '2026-12-01')).toBe('Edited Dec 1: your cues and substitutions.')
    expect(editedDetail({ cues: false, substitutions: false }, '2026-12-01')).toBeNull()
  })
})

describe('cueCountWords', () => {
  it('stays quiet for a short cue, counts near the limit, and says how far over', () => {
    expect(cueCountWords('Feet high')).toBeNull()
    expect(cueCountWords('x'.repeat(CUE_COUNT_FROM))).toBe(`${CUE_COUNT_FROM} of 200 characters.`)
    expect(cueCountWords('x'.repeat(200))).toBe('200 of 200 characters.')
    expect(cueCountWords('x'.repeat(214))).toBe('214 of 200 characters: 14 over.')
    // Counted as it would be stored.
    expect(cueCountWords(`  ${'x'.repeat(200)}  `)).toBe('200 of 200 characters.')
  })

  it('counts an emoji as one character, as the refusal and the schema do', () => {
    expect(cueCountWords('💪'.repeat(150))).toBeNull()
    expect(cueCountWords('💪'.repeat(170))).toBe('170 of 200 characters.')
    expect(cueCountWords('💪'.repeat(201))).toBe('201 of 200 characters: 1 over.')
  })
})

describe('removedWords', () => {
  it('names what came off the list', () => {
    expect(removedWords('cue', 'Feet high')).toBe('Removed the cue “Feet high”.')
    expect(removedWords('substitution', 'Goblet squat to a bench')).toBe('Removed Goblet squat to a bench from the substitutions.')
  })
})

describe('addSections and patternWords', () => {
  it('offers the slot’s own pattern first, then the rest under their pattern’s name', () => {
    const slot = seedSlot('p1-a', 'p1a-5')
    const sections = addSections(slot, { cues: [], substitutionIds: slot.substitutionIds }, program.exercises)
    expect(sections.same.heading).toBe('Hip, like Hip abductor machine')
    expect(sections.same.exercises.map((e) => e.id)).toEqual(['smith-hip-thrust', 'db-glute-bridge', 'db-hip-thrust', 'single-leg-hip-thrust', 'hip-adductor-machine', 'cable-hip-adduction', 'copenhagen-plank-long'])
    expect(sections.others[0]?.heading).toBe('Squat')
    expect(sections.others.flatMap((g) => g.exercises)).toHaveLength(program.exercises.length - 4 - 7)
    expect(sections.otherCount).toBe(program.exercises.length - 4 - 7)
  })

  it('words a pattern as program.md would: capitalized, hyphen kept', () => {
    expect(patternWords('single-leg')).toBe('Single-leg')
    expect(patternWords('plyo')).toBe('Plyo')
  })
})

describe('tableLayout', () => {
  const table = (header: string[], rows: string[][]): Extract<Block, { kind: 'table' }> => ({
    kind: 'table',
    header: header.map((h) => parseInline(h)),
    rows: rows.map((r) => r.map((c) => (c === '' ? [] : parseInline(c)))),
  })

  it('keeps a narrow table of short cells as a grid: the mileage plan', () => {
    expect(tableLayout(table(['Week', 'Starts', 'Miles', 'Down week'], [['1', 'Nov 2', '10', ''], ['4', 'Nov 23', '9', 'down']]))).toBe('grid')
  })

  it('stacks a table with a long cell or more than four columns, so a phone never scrolls sideways', () => {
    expect(tableLayout(table(['#', 'Exercise', 'Sets × reps', 'Cues'], [['1', 'Leg press, both legs', '3 × 10–12', 'Feet high and shoulder-width; lower for 3 s']]))).toBe('stacked')
    expect(tableLayout(table(['a', 'b', 'c', 'd', 'e'], [['1', '2', '3', '4', '5']]))).toBe('stacked')
  })
})
