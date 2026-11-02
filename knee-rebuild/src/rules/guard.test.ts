import { describe, expect, it } from 'vitest'

// Sources of every module in this folder, read at test time through Vite (no node APIs needed).
const sources = import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true })
const paths = Object.keys(sources)
const modules = paths.filter((p) => !p.endsWith('.test.ts'))
const viteConfig = import.meta.glob<string>('/vite.config.ts', { query: '?raw', import: 'default', eager: true })['/vite.config.ts'] ?? ''

describe('src/rules stays pure and tested', () => {
  it('finds the rule modules', () => {
    expect(modules.length).toBeGreaterThan(5)
  })
  it('reads every source on every run: Vitest’s module cache is off', () => {
    // With it on, a guard's glob is cached with the guard's own source, so a module added since the
    // last run (a rule without a test, a screen reading Settings.dumbbellMax) passes `npm run check`
    // until the guard file itself changes. This guard and src/db/dumbbellMax.guard.test.ts need it off.
    expect(viteConfig).toMatch(/^\s*fsModuleCache: false,/m)
  })
  it('every rule module has a test file beside it', () => {
    for (const m of modules) {
      expect(paths, `${m} has no test`).toContain(m.replace(/\.ts$/, '.test.ts'))
    }
  })
  it('no rule module touches React, Dexie, the DOM or the clock', () => {
    const banned = [/from ['"]react/, /from ['"]dexie/, /\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /\bnavigator\./, /new Date\(\)/, /Date\.now\(/]
    for (const m of modules) {
      const source = sources[m] ?? ''
      for (const pattern of banned) expect(source, `${m} matches ${pattern}`).not.toMatch(pattern)
    }
  })
  it('rule modules only import from the schema or each other', () => {
    for (const m of modules) {
      const source = sources[m] ?? ''
      for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
        const spec = match[1] ?? ''
        expect(spec.startsWith('./') || spec.startsWith('../schema/'), `${m} imports ${spec}`).toBe(true)
      }
    }
  })
})
