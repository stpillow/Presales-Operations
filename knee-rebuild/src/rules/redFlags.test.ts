import { describe, expect, it } from 'vitest'
import type { MorningCheck } from '../schema/index.ts'
import { NO_RED_FLAG, afterMorningCheck, clearRedFlag, progressionSuspended, stopMessage } from './redFlags.ts'

const check = (redFlags: string[], date = '2026-11-04'): MorningCheck => ({
  id: 'm1', date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags,
})
const catalog = [{ id: 'locking', text: 'Locking or catching: a mechanical block to straightening or bending' }, { id: 'numbness', text: 'Numbness or tingling below the knee' }]

describe('red-flag state (rule 9)', () => {
  it('any ticked flag turns the state on and suspends progression', () => {
    const state = afterMorningCheck(NO_RED_FLAG, check(['locking']))
    expect(state).toEqual({ active: true, since: '2026-11-04', items: ['locking'] })
    expect(progressionSuspended(state)).toBe(true)
    expect(stopMessage(state, catalog)).toEqual({ headline: 'Stop. Call the ortho or PT.', items: [catalog[0]?.text] })
  })
  it('a clean check does not clear it; later flags accumulate', () => {
    const on = afterMorningCheck(NO_RED_FLAG, check(['locking']))
    expect(afterMorningCheck(on, check([], '2026-11-05'))).toEqual(on)
    expect(afterMorningCheck(on, check(['numbness'], '2026-11-06'))).toEqual({ active: true, since: '2026-11-04', items: ['locking', 'numbness'] })
  })
  it('clearing needs a note and records it', () => {
    const on = afterMorningCheck(NO_RED_FLAG, check(['locking']))
    expect(() => clearRedFlag(on, '   ', '2026-11-07')).toThrow()
    const off = clearRedFlag(on, 'PT saw it Nov 6: no mechanical block, cleared to train', '2026-11-07')
    expect(off).toEqual({ active: false, items: [], clearedOn: '2026-11-07', clearNote: 'PT saw it Nov 6: no mechanical block, cleared to train' })
    expect(progressionSuspended(off)).toBe(false)
    expect(stopMessage(off, catalog)).toBeNull()
  })
})
