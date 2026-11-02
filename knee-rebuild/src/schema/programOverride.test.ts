import { describe, expect, it } from 'vitest'
import { CUE_MAX, Cue, ProgramOverride } from './index.ts'

// The Program screen's edits (M6): the row Dexie version 4 stores for an edited slot.

describe('Cue', () => {
  it('is one line of plain text, 1 to 200 characters once trimmed', () => {
    expect(Cue.parse('  Feet high and shoulder-width  ')).toBe('Feet high and shoulder-width')
    expect(Cue.parse('x'.repeat(CUE_MAX))).toHaveLength(200)
    expect(Cue.safeParse('x'.repeat(CUE_MAX + 1)).success).toBe(false)
    expect(Cue.safeParse('   ').success).toBe(false)
    expect(Cue.safeParse('').success).toBe(false)
  })

  it('refuses a line break, a tab and text that shows nothing', () => {
    expect(Cue.safeParse('Feet high\nlower for 3 s').success).toBe(false)
    expect(Cue.safeParse('Feet\thigh').success).toBe(false)
    expect(Cue.safeParse('​​').success).toBe(false)
    expect(Cue.safeParse('ㅤ').success).toBe(false)
  })

  it('keeps program.md’s own punctuation: degrees, en dashes, arrows', () => {
    expect(Cue.parse('From 90° to about 45°, stopping short of straight')).toBe('From 90° to about 45°, stopping short of straight')
    expect(Cue.parse('RPE 6→7, 2–3 s')).toBe('RPE 6→7, 2–3 s')
  })
})

describe('ProgramOverride', () => {
  it('holds a slot id, the edited cues and substitutions (either or both), and the day', () => {
    const row = { slotId: 'p1a-1', cues: ['Feet high'], substitutionIds: ['smith-box-squat'], editedOn: '2026-11-16' }
    expect(ProgramOverride.parse(row)).toEqual(row)
    expect(ProgramOverride.parse({ slotId: 'p1a-1', cues: [], editedOn: '2026-11-16' })).toEqual({ slotId: 'p1a-1', cues: [], editedOn: '2026-11-16' })
    expect(ProgramOverride.parse({ slotId: 'p1a-1', substitutionIds: [], editedOn: '2026-11-16' }).substitutionIds).toEqual([])
  })

  it('trims each cue as it is stored', () => {
    expect(ProgramOverride.parse({ slotId: 'p1a-1', cues: [' Feet high '], editedOn: '2026-11-16' }).cues).toEqual(['Feet high'])
  })

  it('refuses a row that edits nothing, an unknown field, a bad id or date, and a substitution listed twice', () => {
    expect(ProgramOverride.safeParse({ slotId: 'p1a-1', editedOn: '2026-11-16' }).success).toBe(false)
    expect(ProgramOverride.safeParse({ slotId: 'p1a-1', cues: [], editedOn: '2026-11-16', note: 'x' }).success).toBe(false)
    expect(ProgramOverride.safeParse({ slotId: 'P1A 1', cues: [], editedOn: '2026-11-16' }).success).toBe(false)
    expect(ProgramOverride.safeParse({ slotId: 'p1a-1', cues: [], editedOn: 'Nov 16' }).success).toBe(false)
    expect(ProgramOverride.safeParse({ slotId: 'p1a-1', substitutionIds: ['Smith box squat'], editedOn: '2026-11-16' }).success).toBe(false)
    expect(ProgramOverride.safeParse({ slotId: 'p1a-1', substitutionIds: ['smith-box-squat', 'smith-box-squat'], editedOn: '2026-11-16' }).success).toBe(false)
    expect(ProgramOverride.safeParse({ slotId: 'p1a-1', cues: ['ok', ' '], editedOn: '2026-11-16' }).success).toBe(false)
  })
})
