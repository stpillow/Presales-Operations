import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { program, templateFor } from '../program/program.ts'
import type { ProgramOverride } from '../schema/index.ts'
import { db } from './db.ts'
import { clearProgramOverride, defaultSettings, ensureLocations, ensureSettings, getProgramOverrides, loadHistory, resetAll, saveProgramOverride } from './repo.ts'

// The Program screen's writes (M6): each one parses the row and checks it against program.md's slot before it reaches IndexedDB.

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false })
  await ensureSettings(defaultSettings(program))
  await ensureLocations(program, '2026-11-02')
})

const edit = (over: Partial<ProgramOverride>): ProgramOverride => ({ slotId: 'p1a-1', editedOn: '2026-11-16', ...over }) as ProgramOverride

describe('saving a slot’s edit', () => {
  it('stores the row, reads it back, and hands it to the engine with the history', async () => {
    const saved = await saveProgramOverride(edit({ cues: ['  Feet high  '], substitutionIds: ['goblet-squat-bench', 'smith-box-squat'] }), program)
    expect(saved).toEqual({ slotId: 'p1a-1', cues: ['Feet high'], substitutionIds: ['goblet-squat-bench', 'smith-box-squat'], editedOn: '2026-11-16' })
    expect(await getProgramOverrides()).toEqual([saved])
    expect((await loadHistory()).programOverrides).toEqual([saved])
  })

  it('replaces the slot’s earlier row, and keeps other slots’ rows', async () => {
    await saveProgramOverride(edit({ cues: ['Feet high'] }), program)
    await saveProgramOverride(edit({ slotId: 'p1a-2', substitutionIds: ['lying-leg-curl'] }), program)
    await saveProgramOverride(edit({ substitutionIds: ['smith-box-squat'], editedOn: '2026-11-17' }), program)
    const rows = await getProgramOverrides()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.slotId === 'p1a-1')).toEqual({ slotId: 'p1a-1', substitutionIds: ['smith-box-squat'], editedOn: '2026-11-17' })
  })

  it('refuses, in words, a slot program.md doesn’t have, the slot’s own exercise, an exercise not in the catalog, writing nothing', async () => {
    await saveProgramOverride(edit({ cues: ['Feet high'] }), program)
    await expect(saveProgramOverride(edit({ slotId: 'p9a-1', cues: [] }), program)).rejects.toThrow('No slot p9a-1 in the program.')
    await expect(saveProgramOverride(edit({ substitutionIds: ['leg-press'] }), program)).rejects.toThrow('Leg press, both legs is this slot’s own exercise, so it is never its substitution.')
    await expect(saveProgramOverride(edit({ substitutionIds: ['kettlebell-swing'] }), program)).rejects.toThrow('kettlebell-swing is not in the program’s catalog')
    expect(await getProgramOverrides()).toEqual([{ slotId: 'p1a-1', cues: ['Feet high'], editedOn: '2026-11-16' }])
  })

  it('refuses a row the schema refuses: a cue over 200 characters, an empty edit, a repeat', async () => {
    await expect(saveProgramOverride(edit({ cues: ['x'.repeat(201)] }), program)).rejects.toThrow()
    await expect(saveProgramOverride(edit({}), program)).rejects.toThrow()
    await expect(saveProgramOverride(edit({ substitutionIds: ['smith-box-squat', 'smith-box-squat'] }), program)).rejects.toThrow()
    expect(await db.programOverrides.count()).toBe(0)
  })

  it('never writes the seed: program.md’s slot is as it was', async () => {
    const before = structuredClone(templateFor(1, 'A'))
    await saveProgramOverride(edit({ cues: [], substitutionIds: [] }), program)
    expect(templateFor(1, 'A')).toEqual(before)
  })
})

describe('Back to program.md’s', () => {
  it('deletes the slot’s row, and leaves the others', async () => {
    await saveProgramOverride(edit({ cues: ['Feet high'] }), program)
    await saveProgramOverride(edit({ slotId: 'p1a-2', cues: [] }), program)
    await clearProgramOverride('p1a-1')
    expect((await getProgramOverrides()).map((r) => r.slotId)).toEqual(['p1a-2'])
    // A slot with no row: nothing to do, and no error.
    await clearProgramOverride('p1a-1')
    expect(await db.programOverrides.count()).toBe(1)
  })
})

describe('Reset all data', () => {
  it('clears the edits with everything else', async () => {
    await saveProgramOverride(edit({ cues: ['Feet high'] }), program)
    await resetAll(defaultSettings(program), program, '2026-11-20')
    expect(await getProgramOverrides()).toEqual([])
  })
})
