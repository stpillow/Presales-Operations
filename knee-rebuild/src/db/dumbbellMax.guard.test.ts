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
 * The only places outside src/db the name may stand, each a pattern that must match its file once:
 * the Settings schema's own field; `prescribe`'s input field of the same name (the rack when no gym
 * is given) and its read of it; and planSession filling that field from the gym. None of them
 * reads Settings'.
 */
const ALLOWED: Record<string, readonly RegExp[]> = {
  '/src/schema/log.ts': [/^\s*dumbbellMax: z\.number\(\)/m],
  '/src/rules/prescription.ts': [/^\s*dumbbellMax: number$/m, /\braw\.dumbbellMax\b/],
  '/src/app/session.ts': [/\bdumbbellMax: gym\.dumbbellMaxLb\b/],
}

/** Comments may name the field; only code reads it. A `//` after a colon is a URL, not a comment. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Any use of the name in code: property and bracket access, and destructuring of every kind (flat,
 * nested, renamed, with a default, in a parameter list), since each needs the bare name; and a
 * bracket key built from 'dumbbell' and the rest. `dumbbellMaxLb`, the gym's rack, is another name.
 */
function readsDumbbellMax(source: string): boolean {
  const text = code(source)
  return /\bdumbbellMax\b/.test(text) || /['"`]dumbbell['"`]\s*\+/.test(text)
}

/** The source with its allowed uses taken out. */
function withoutAllowed(path: string, source: string): string {
  return (ALLOWED[path] ?? []).reduce((text, allowed) => text.replace(allowed, ''), source)
}

describe('Settings.dumbbellMax is read only inside src/db', () => {
  it('catches a read and lets the gym’s own rack, a comment and a URL through', () => {
    expect(readsDumbbellMax('const max = settings.dumbbellMax')).toBe(true)
    expect(readsDumbbellMax('loadMax(exercise, draft?.dumbbellMax)')).toBe(true)
    expect(readsDumbbellMax("const max = settings['dumbbellMax']")).toBe(true)
    expect(readsDumbbellMax('const { injuredSide, dumbbellMax } = settings')).toBe(true)
    // Destructuring in a parameter list, nested, renamed or with a default, and a key built from parts.
    expect(readsDumbbellMax('function rack({ dumbbellMax }: Settings) { return 0 }')).toBe(true)
    expect(readsDumbbellMax('const rack = ({ dumbbellMax }: Settings) => 0')).toBe(true)
    expect(readsDumbbellMax('const { redFlag: { active }, dumbbellMax } = settings')).toBe(true)
    expect(readsDumbbellMax('function Line({ settings: { dumbbellMax } }: P) { return null }')).toBe(true)
    expect(readsDumbbellMax('export function Logger({ today, settings: { dumbbellMax: max = 80 } }: Props) {}')).toBe(true)
    expect(readsDumbbellMax("const max = s['dumbbell' + 'Max']")).toBe(true)
    expect(readsDumbbellMax('const rack = location.dumbbellMaxLb')).toBe(false)
    expect(readsDumbbellMax('// Settings.dumbbellMax is frozen\n/** or Settings.dumbbellMax */ const a = 1')).toBe(false)
    expect(readsDumbbellMax("const url = 'https://www.strava.com' // a link")).toBe(false)
  })

  it('finds the sources', () => {
    expect(outsideDb.length).toBeGreaterThan(40)
    expect(outsideDb).toContain('/src/app/session.ts')
    expect(outsideDb).toContain('/scripts/program.ts')
  })

  it('each allowed use is still where it was, once', () => {
    for (const [path, patterns] of Object.entries(ALLOWED)) {
      const text = code(sources[path] ?? '')
      for (const pattern of patterns) expect(text.match(new RegExp(pattern.source, `${pattern.flags}g`))?.length, `${path}: ${pattern}`).toBe(1)
    }
  })

  it('no source outside src/db reads it', () => {
    for (const path of outsideDb) {
      const source = withoutAllowed(path, code(sources[path] ?? ''))
      expect(readsDumbbellMax(source), `${path} reads Settings.dumbbellMax; read the gym's dumbbellMaxLb instead`).toBe(false)
    }
  })
})
