import { describe, expect, it } from 'vitest'

/*
 * Training load is a warning only (metrics phase 1): it changes no prescription, reading, cap or
 * gate. This holds it there. Only the screen code that shows it (Progress, the session's Summary,
 * Finish and End, the run logger, through their helpers) may import src/rules/trainingLoad.ts, and no rule module but
 * trainingLoad.ts may read the fields it reads (a session's RPE and minutes, a run's RPE), so no
 * decision can come to rest on them.
 */

// Every app source, read at test time through Vite (no node APIs needed).
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const rules = import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true })

/** The screen code allowed to import it, and the module's own tests. */
const IMPORTERS: readonly string[] = [
  '/src/rules/trainingLoad.test.ts',
  '/src/screens/Progress.helpers.ts',
  '/src/screens/Progress.helpers.test.ts',
  '/src/screens/session/EndPanels.helpers.ts',
  '/src/screens/session/EndPanels.helpers.test.ts',
  '/src/screens/RunLogger.helpers.ts',
  '/src/screens/RunLogger.helpers.test.ts',
]

/** A static or dynamic import of the module, by any relative path, with or without the extension. */
function importsTrainingLoad(source: string): boolean {
  return /(?:from|import\()\s*['"`](?:\.{1,2}\/)+(?:[\w.-]+\/)*trainingLoad(?:\.ts)?['"`]/.test(source)
}

/** A mention of a field only training load reads. */
function mentionsLoadFields(source: string): boolean {
  return /\bsessionRpe\b|\bdurationMinutes\b|\bruns?\.rpe\b/.test(source)
}

describe('training load is a warning only', () => {
  it('catches an import of the module by any path, and nothing else', () => {
    expect(importsTrainingLoad("import { acuteChronic } from '../rules/trainingLoad.ts'")).toBe(true)
    expect(importsTrainingLoad('import { acuteChronic } from "./trainingLoad"')).toBe(true)
    expect(importsTrainingLoad("const m = await import('../../rules/trainingLoad.ts')")).toBe(true)
    expect(importsTrainingLoad("import { fmt } from './Progress.helpers.ts'")).toBe(false)
    expect(importsTrainingLoad("import { loadSeries } from '../rules/progress.ts'")).toBe(false)
    expect(mentionsLoadFields('if (workout.sessionRpe > 8) return')).toBe(true)
    expect(mentionsLoadFields('const { durationMinutes } = w')).toBe(true)
    expect(mentionsLoadFields('return run.rpe ?? 5')).toBe(true)
    expect(mentionsLoadFields('return set.rpe ?? slot.rpeTarget')).toBe(false)
  })

  it('finds the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(Object.keys(sources)).toContain('/src/rules/trainingLoad.ts')
    for (const path of IMPORTERS) expect(Object.keys(sources), path).toContain(path)
  })

  it('only the screens that show it import it', () => {
    for (const [path, source] of Object.entries(sources)) {
      if (path === '/src/rules/trainingLoad.guard.test.ts' || IMPORTERS.includes(path)) continue
      expect(importsTrainingLoad(source), `${path} imports trainingLoad`).toBe(false)
    }
  })

  it('no other rule module reads a session’s RPE or minutes, or a run’s RPE', () => {
    for (const [path, source] of Object.entries(rules)) {
      if (path.endsWith('.test.ts') || path === './trainingLoad.ts') continue
      expect(mentionsLoadFields(source), `${path} mentions a training-load field`).toBe(false)
    }
  })
})
