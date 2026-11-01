import { describe, expect, it } from 'vitest'
import { IsoDate } from './enums.ts'
import { DEFAULT_KIT, Location, MorningCheck, PLANET_FITNESS_LOCATION_ID, Run, SetLog, Settings, Workout } from './log.ts'

describe('IsoDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(IsoDate.safeParse('2026-11-02').success).toBe(true)
    expect(IsoDate.safeParse('2028-02-29').success).toBe(true)
    expect(IsoDate.safeParse('2026-13-45').success).toBe(false)
    expect(IsoDate.safeParse('2026-02-30').success).toBe(false)
    expect(IsoDate.safeParse('2026-11-2').success).toBe(false)
  })
})

describe('SetLog', () => {
  const base = { id: 's1', workoutId: 'w1', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber: 1, side: 'both', load: 8, loadUnit: 'plate' } as const
  it('needs reps or seconds, exactly one', () => {
    expect(SetLog.safeParse({ ...base, reps: 12 }).success).toBe(true)
    expect(SetLog.safeParse({ ...base, seconds: 30 }).success).toBe(true)
    expect(SetLog.safeParse({ ...base }).success).toBe(false)
    expect(SetLog.safeParse({ ...base, reps: 12, seconds: 30 }).success).toBe(false)
  })
  it('rejects unknown keys so a typo cannot vanish silently', () => {
    expect(SetLog.safeParse({ ...base, reps: 12, pain: 2 }).success).toBe(false)
  })
})

describe('nested objects are strict too', () => {
  it('MorningCheck.appliesTo and Settings.redFlag reject unknown keys', () => {
    const check = { id: 'm1', date: '2026-11-03', appliesTo: { kind: 'workout', id: 'w1' }, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [] }
    expect(MorningCheck.safeParse(check).success).toBe(true)
    expect(MorningCheck.safeParse({ ...check, appliesTo: { kind: 'workout', id: 'w1', extra: 1 } }).success).toBe(false)
    const settings = { injuredSide: 'right', startDate: '2026-11-02', dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false }
    expect(Settings.safeParse(settings).success).toBe(true)
    expect(Settings.safeParse({ ...settings, redFlag: { active: false, items: [], extra: 1 } }).success).toBe(false)
  })
})

describe('Run', () => {
  const base = { id: 'r1', date: '2026-11-02', type: 'mbr', miles: 3.1, minutes: 29, effort: 'easy', maxPain: 1 } as const
  it('only accepts https Strava links', () => {
    expect(Run.safeParse({ ...base, stravaUrl: 'https://www.strava.com/activities/1' }).success).toBe(true)
    expect(Run.safeParse({ ...base, stravaUrl: 'http://www.strava.com/activities/1' }).success).toBe(false)
    expect(Run.safeParse({ ...base, stravaUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(Run.safeParse({ ...base, stravaUrl: 'https://strava.com/activities/1' }).success).toBe(true)
    expect(Run.safeParse({ ...base, stravaUrl: 'https://example.com/strava.com' }).success).toBe(false)
  })
})

describe('Settings gains the active gym and the kit (M4b)', () => {
  const stored = { injuredSide: 'right', startDate: '2026-11-02', dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false } as const
  it('a row stored before M4b reads as Planet Fitness with both carried items in the bag', () => {
    const settings = Settings.parse(stored)
    expect(settings.activeLocationId).toBe('planet-fitness')
    expect(settings.activeLocationId).toBe(PLANET_FITNESS_LOCATION_ID)
    expect(settings.kit).toEqual(['ankle-strap', 'mini-band'])
    expect(settings.kit).toEqual([...DEFAULT_KIT])
    expect(settings.dumbbellMax).toBe(80)
  })
  it('the default kit is a fresh array each time, so editing one parse cannot leak into the next', () => {
    const first = Settings.parse(stored)
    first.kit.pop()
    expect(Settings.parse(stored).kit).toEqual(['ankle-strap', 'mini-band'])
  })
  it('keeps a chosen gym and kit, an empty kit included', () => {
    expect(Settings.parse({ ...stored, activeLocationId: 'hotel', kit: [] })).toMatchObject({ activeLocationId: 'hotel', kit: [] })
    expect(Settings.parse({ ...stored, kit: ['mini-band'] }).kit).toEqual(['mini-band'])
  })
  it('rejects a blank gym id, a non-kebab item and an item listed twice', () => {
    expect(Settings.safeParse({ ...stored, activeLocationId: '' }).success).toBe(false)
    expect(Settings.safeParse({ ...stored, kit: ['Ankle strap'] }).success).toBe(false)
    expect(Settings.safeParse({ ...stored, kit: ['mini-band', 'mini-band'] }).success).toBe(false)
  })
})

describe('Location (M4b)', () => {
  const home = {
    id: 'planet-fitness',
    name: 'Planet Fitness',
    present: ['smith-machine', 'seated-leg-press', 'mats'],
    dumbbellMaxLb: 80,
    startedFrom: 'planet-fitness',
    listVersion: 1,
    extras: [],
    markedOff: [],
    createdOn: '2026-11-01',
    archived: false,
  } as const
  it('parses a gym and its typed extras and mark-offs', () => {
    expect(Location.safeParse(home).success).toBe(true)
    const hotel = { ...home, id: 'loc-1', name: 'Marriott Downtown', startedFrom: 'empty', dumbbellMaxLb: 25, extras: [{ id: 'x1', text: 'kettlebells', addedOn: '2026-11-10' }], markedOff: [{ id: 'smith-machine', on: '2026-11-10' }] }
    expect(Location.safeParse(hotel).success).toBe(true)
  })
  it('a dumbbell max of 0 means no dumbbells; negative or fractional maxes are refused', () => {
    expect(Location.safeParse({ ...home, dumbbellMaxLb: 0 }).success).toBe(true)
    expect(Location.safeParse({ ...home, dumbbellMaxLb: -5 }).success).toBe(false)
    expect(Location.safeParse({ ...home, dumbbellMaxLb: 52.5 }).success).toBe(false)
  })
  it('names run 1 to 60 characters, trimmed', () => {
    expect(Location.parse({ ...home, name: '  Hotel gym  ' }).name).toBe('Hotel gym')
    expect(Location.safeParse({ ...home, name: '' }).success).toBe(false)
    expect(Location.safeParse({ ...home, name: '   ' }).success).toBe(false)
    expect(Location.safeParse({ ...home, name: 'x'.repeat(60) }).success).toBe(true)
    expect(Location.safeParse({ ...home, name: 'x'.repeat(61) }).success).toBe(false)
  })
  it('starts from Planet Fitness\'s list or from nothing, and nothing else', () => {
    expect(Location.safeParse({ ...home, startedFrom: 'empty' }).success).toBe(true)
    expect(Location.safeParse({ ...home, startedFrom: 'hotel' }).success).toBe(false)
  })
  it('present holds equipment ids, each once; typed text belongs in extras', () => {
    expect(Location.safeParse({ ...home, present: [] }).success).toBe(true)
    expect(Location.safeParse({ ...home, present: ['mats', 'mats'] }).success).toBe(false)
    expect(Location.safeParse({ ...home, present: ['Kettlebells'] }).success).toBe(false)
    expect(Location.safeParse({ ...home, extras: [{ id: 'x1', text: '  ', addedOn: '2026-11-10' }] }).success).toBe(false)
  })
  it('needs a list version, real dates, and rejects unknown keys at every level', () => {
    expect(Location.safeParse({ ...home, listVersion: 0 }).success).toBe(false)
    expect(Location.safeParse({ ...home, createdOn: '2026-02-30' }).success).toBe(false)
    expect(Location.safeParse({ ...home, markedOff: [{ id: 'mats', on: '2026-11-31' }] }).success).toBe(false)
    expect(Location.safeParse({ ...home, color: 'green' }).success).toBe(false)
    expect(Location.safeParse({ ...home, extras: [{ id: 'x1', text: 'kettlebells', addedOn: '2026-11-10', by: 'me' }] }).success).toBe(false)
    expect(Location.safeParse({ ...home, markedOff: [{ id: 'mats', on: '2026-11-10', why: 'gone' }] }).success).toBe(false)
  })
})

describe('rows stored before M4b still parse (M4b fields are optional)', () => {
  it('a workout without a gym, a set without rackCapped, a run without a gym', () => {
    const workout = { id: 'w1', date: '2026-11-03', templateId: 'p1-a', phase: 1, week: 1, isDeload: false, status: 'finished' } as const
    expect(Workout.parse(workout).locationId).toBeUndefined()
    expect(Workout.parse({ ...workout, locationId: 'loc-1' }).locationId).toBe('loc-1')
    const set = { id: 's1', workoutId: 'w1', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber: 1, side: 'both', load: 90, loadUnit: 'lb', reps: 12 } as const
    expect(SetLog.parse(set).rackCapped).toBeUndefined()
    expect(SetLog.parse({ ...set, rackCapped: true }).rackCapped).toBe(true)
    const run = { id: 'r1', date: '2026-11-04', type: 'elliptical-swap', miles: 0, minutes: 35, effort: 'easy', maxPain: 1 } as const
    expect(Run.parse(run).locationId).toBeUndefined()
    expect(Run.parse({ ...run, locationId: 'loc-1' }).locationId).toBe('loc-1')
  })
})
