import { describe, expect, it } from 'vitest'
import type { Fit } from '../rules/fitWindow.ts'
import { windowWords } from './Window.helpers.ts'

const fit = (over: Partial<Fit> = {}): Fit => ({ keep: ['a', 'b', 'c'], dropped: [], fullMinutes: 36, keptMinutes: 36, fits: true, ...over })
const name = (id: string) => ({ d: 'Calf raise', e: 'Plank' })[id] ?? id

describe('windowWords', () => {
  it('says what the full session takes when no time is given', () => {
    expect(windowWords(fit(), null, 3, name)).toEqual(['The full session: about 36 min.'])
  })
  it('says everything fits, in the singular or plural', () => {
    expect(windowWords(fit(), 40, 3, name)).toEqual(['The full session is about 36 min.', 'In 40 min all 3 exercises fit.'])
    expect(windowWords(fit({ keep: ['a'] }), 40, 1, name)[1]).toBe('In 40 min all 1 exercise fits.')
  })
  it('says how many fit and names what is left out', () => {
    expect(windowWords(fit({ keep: ['a', 'b'], dropped: ['d', 'e'], keptMinutes: 24 }), 25, 4, name)).toEqual([
      'The full session is about 36 min.',
      'In 25 min, 2 of 4 exercises fit (about 24 min).',
      'Left out: Calf raise, Plank.',
    ])
  })
  it('says when what must stay already runs past the time', () => {
    const lines = windowWords(fit({ keep: ['a'], dropped: ['d'], keptMinutes: 12, fits: false }), 10, 2, name)
    expect(lines.at(-1)).toBe('The first exercise and what is already logged stay, and run past 10 min.')
  })
})
