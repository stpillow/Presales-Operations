import { describe, expect, it } from 'vitest'

/*
 * Settings.dumbbellMax is frozen from M4b (design section 2): each gym's own `dumbbellMaxLb` is the
 * rack now, and the home gym is first written from the frozen value (`ensureLocations`, here in
 * src/db). This fails if anything outside src/db reads it. Tests are left out: their fixtures build
 * settings rows, and the schema's own test reads the default back.
 */

// Every app and script source, read at test time through Vite (no node APIs needed).
const sources = {
  ...import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('/scripts/**/*.ts', { query: '?raw', import: 'default', eager: true }),
}
const outsideDb = Object.keys(sources).filter((path) => !path.startsWith('/src/db/') && !/\.test\.tsx?$/.test(path))

/**
 * `prescribe` has an input field of the same name (the rack when no gym is given); planSession
 * fills it from the gym. Reading that field is not reading Settings'.
 */
const ALLOWED: Record<string, RegExp> = { '/src/rules/prescription.ts': /\braw\.dumbbellMax\b/g }

/** Comments may name the field; only code reads it. A `//` after a colon is a URL, not a comment. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Property access (`settings.dumbbellMax`, `s?.dumbbellMax`), bracket access, and destructuring of the field. */
function readsDumbbellMax(source: string): boolean {
  const text = code(source)
  return /\.dumbbellMax\b/.test(text) || /\[\s*['"`]dumbbellMax['"`]\s*\]/.test(text) || /\{[^{}]*\bdumbbellMax\b[^{}]*\}\s*=(?![=>])/.test(text)
}

describe('Settings.dumbbellMax is read only inside src/db', () => {
  it('catches a read and lets the gym’s own rack, a comment and a write in a fixture through', () => {
    expect(readsDumbbellMax('const max = settings.dumbbellMax')).toBe(true)
    expect(readsDumbbellMax('loadMax(exercise, draft?.dumbbellMax)')).toBe(true)
    expect(readsDumbbellMax("const max = settings['dumbbellMax']")).toBe(true)
    expect(readsDumbbellMax('const { injuredSide, dumbbellMax } = settings')).toBe(true)
    expect(readsDumbbellMax('const rack = location.dumbbellMaxLb')).toBe(false)
    expect(readsDumbbellMax('// Settings.dumbbellMax is frozen\n/** or Settings.dumbbellMax */ const a = 1')).toBe(false)
    expect(readsDumbbellMax("const url = 'https://www.strava.com' // a link")).toBe(false)
  })

  it('finds the sources', () => {
    expect(outsideDb.length).toBeGreaterThan(40)
    expect(outsideDb).toContain('/src/app/session.ts')
    expect(outsideDb).toContain('/scripts/program.ts')
  })

  it('no source outside src/db reads it', () => {
    for (const path of outsideDb) {
      const allowed = ALLOWED[path]
      const source = allowed ? (sources[path] ?? '').replace(allowed, '') : (sources[path] ?? '')
      expect(readsDumbbellMax(source), `${path} reads Settings.dumbbellMax; read the gym's dumbbellMaxLb instead`).toBe(false)
    }
  })
})
