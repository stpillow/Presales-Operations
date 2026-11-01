import { describe, expect, it } from 'vitest'
import type { Equipment, EquipmentId, Exercise, Location, Requirement, SessionTemplate, Slot } from '../schema/index.ts'
import {
  availableEquipment,
  fallbacksAfter,
  forNextProgramUpdate,
  locationCoverage,
  matchTyped,
  missingFor,
  normalizeTyped,
  routeSlot,
  runSwapsHere,
  slotOrder,
  stageCeiling,
  suggestedRunSwap,
} from './equipment.ts'

// Inline fixtures shaped like the seed (design section 3); the live seed is checked in src/program/equipment.seed.test.ts.

function item(id: string, name: string, aliases: string[] = [], extra: Partial<Equipment> = {}): Equipment {
  return { id, name, group: 'Fixture', source: name, aliases, carried: false, hedged: false, addedIn: 1, ...extra }
}

const vocabulary: Equipment[] = [
  item('smith-machine', 'Smith machine', ['smith']),
  item('seated-leg-press', 'Seated leg press', ['seated leg press machine']),
  item('leg-press-45', '45° leg press', ['45 leg press', '45 degree leg press']),
  item('dumbbells', 'Dumbbells', ['dumbbell']),
  item('flat-bench', 'Flat bench', ['bench']),
  item('back-extension-bench', '45° back extension bench', ['back extension bench']),
  item('lat-pulldown', 'Lat pulldown', ['pulldown']),
  item('seated-row', 'Seated row', ['seated row machine', 'seated cable row']),
  item('cable-station', 'Cable station', ['cable machine', 'cable']),
  item('hip-abductor-machine', 'Hip abductor machine', ['abductor machine']),
  item('leg-extension-machine', 'Leg extension machine', ['leg extension']),
  item('seated-leg-curl', 'Seated leg curl', ['seated leg curl machine']),
  item('lying-leg-curl', 'Lying leg curl', ['prone leg curl']),
  item('seated-calf-machine', 'Seated calf machine', ['calf machine']),
  item('chest-press-machine', 'Chest press machine', ['chest press']),
  item('shoulder-press-machine', 'Shoulder press machine', ['shoulder press']),
  item('step-platforms', 'Step platforms', ['step']),
  item('stair', 'Stair', ['lowest stair']),
  item('mats', 'Mats', ['mat', 'folded mat']),
  item('bosu', 'Bosu or balance pad', ['bosu', 'bosu ball', 'balance pad'], { hedged: true }),
  item('elliptical', 'Elliptical', ['elliptical trainer']),
  item('rower', 'Rower', ['erg', 'rowing ergometer']),
  item('treadmill', 'Treadmill'),
  item('ankle-strap', 'Cable ankle strap', ['ankle strap'], { carried: true, group: 'Bring' }),
  item('mini-band', 'Mini loop band', ['mini band', 'band'], { carried: true, group: 'Bring' }),
]

/** The fixture club: everything but the carried items, the 45° press, dumbbells (the max decides) and the lying leg curl. */
const planetFitness: EquipmentId[] = vocabulary.filter((i) => !i.carried && !['leg-press-45', 'dumbbells', 'lying-leg-curl'].includes(i.id)).map((i) => i.id)
const KIT: EquipmentId[] = ['ankle-strap', 'mini-band']

function ex(id: string, requires: Requirement[], extra: Partial<Exercise> = {}): Exercise {
  return { id, name: id, pattern: 'squat', equipment: 'fixture', loadType: 'stack', loadUnit: 'lb', increment: 5, loadDirection: 'up', unilateral: false, requires, ...extra }
}

const exercises: Exercise[] = [
  ex('leg-press', ['seated-leg-press']),
  ex('leg-press-45', ['leg-press-45'], { loadType: 'plates' }),
  ex('smith-box-squat', ['smith-machine', 'flat-bench'], { loadType: 'smith-plates' }),
  ex('goblet-squat-bench', ['dumbbells', 'flat-bench'], { loadType: 'dumbbell-single' }),
  ex('standing-calf-raise', [{ anyOf: ['seated-leg-press', 'leg-press-45', 'smith-machine'] }], { pattern: 'calf' }),
  ex('seated-calf-raise', ['seated-calf-machine'], { pattern: 'calf' }),
  ex('single-leg-calf-raise-step', ['step-platforms'], { pattern: 'calf', loadType: 'dumbbell-single' }),
  ex('cable-hip-abduction', ['cable-station', 'ankle-strap'], { pattern: 'hip' }),
  ex('lateral-band-walk', ['mini-band'], { pattern: 'hip', loadType: 'band', loadUnit: 'none', increment: 0 }),
  ex('hip-abductor-machine', ['hip-abductor-machine'], { pattern: 'hip' }),
  ex('copenhagen-plank-short', ['flat-bench'], { pattern: 'hip', loadType: 'time', loadUnit: 's', increment: 5 }),
  ex('nordic-negatives', ['mats', { anyOf: ['lat-pulldown', 'back-extension-bench'] }], { pattern: 'hamstring', loadType: 'bodyweight', loadUnit: 'none', increment: 0 }),
  ex('seated-leg-curl', ['seated-leg-curl'], { pattern: 'hamstring' }),
  ex('step-up', ['step-platforms'], { pattern: 'single-leg', loadType: 'step-height', loadUnit: 'in', increment: 2 }),
  ex('step-up-stair', ['stair'], { pattern: 'single-leg', loadType: 'step-height', loadUnit: 'in', increment: 2 }),
  ex('split-squat', [], { pattern: 'single-leg', loadType: 'dumbbell-each' }),
  ex('single-leg-balance', [], {
    pattern: 'balance',
    loadType: 'time',
    loadUnit: 's',
    stages: ['eyes open', 'eyes closed', 'on a folded mat'],
    stageRequires: [[], [], ['mats']],
  }),
  ex('balance-mat-bosu', [{ anyOf: ['mats', 'bosu'] }], {
    pattern: 'balance',
    loadType: 'time',
    loadUnit: 's',
    stages: ['folded mat', 'folded mat, slow head turns', 'folded mat, eyes closed', 'bosu', 'bosu, slow head turns', 'bosu, eyes closed'],
    stageRequires: [['mats'], ['mats'], ['mats'], ['bosu'], ['bosu'], ['bosu']],
  }),
  ex('dead-bug', [], { pattern: 'core', loadType: 'bodyweight', loadUnit: 'none', increment: 0 }),
]
const byId = new Map(exercises.map((e) => [e.id, e]))
const exercise = (id: string) => byId.get(id) as Exercise

function slot(id: string, exerciseId: string, substitutionIds: string[] = [], extra: Partial<Slot> = {}): Slot {
  return {
    id,
    order: 1,
    label: '1',
    exerciseId,
    sets: 3,
    repsMin: 8,
    repsMax: 10,
    repUnit: 'reps',
    unilateral: false,
    injuredOnly: false,
    prescriptionText: '3 × 8–10',
    cues: [],
    progressionRule: 'double-progression',
    substitutionIds,
    optional: false,
    ...extra,
  }
}

const squat = slot('a-1', 'leg-press', ['leg-press-45', 'smith-box-squat', 'goblet-squat-bench'])
const calf = slot('a-6', 'standing-calf-raise', ['seated-calf-raise', 'single-leg-calf-raise-step'])
const abduction = slot('c-8', 'cable-hip-abduction', ['lateral-band-walk', 'hip-abductor-machine', 'copenhagen-plank-short'])
const nordics = slot('p3a-2', 'nordic-negatives', ['seated-leg-curl'])
const stepUp = slot('c-1', 'step-up', ['step-up-stair', 'split-squat'])
const balance = slot('p2a-7', 'balance-mat-bosu', ['single-leg-balance'])
const allSlots = [squat, calf, abduction, nordics, stepUp, balance]

function location(present: EquipmentId[], extra: Partial<Location> = {}): Location {
  return {
    id: 'gym',
    name: 'Gym',
    present,
    dumbbellMaxLb: 0,
    startedFrom: 'empty',
    listVersion: 1,
    extras: [],
    markedOff: [],
    createdOn: '2026-11-01',
    archived: false,
    ...extra,
  }
}

const here = (present: EquipmentId[], extra: Partial<Location> = {}, kit: EquipmentId[] = KIT) =>
  availableEquipment(location(present, extra), vocabulary, planetFitness, kit)

/** Like Shawn's club: the fixture Planet Fitness list, the 45° press and 80 lb dumbbells. */
const home = here([...planetFitness, 'leg-press-45'], { dumbbellMaxLb: 80, startedFrom: 'planet-fitness' })

describe('availableEquipment', () => {
  it('is what the gym has plus the kit carried to every gym', () => {
    expect([...here(['smith-machine'])].sort()).toEqual(['ankle-strap', 'mini-band', 'smith-machine'])
    expect([...here(['smith-machine'], {}, [])]).toEqual(['smith-machine'])
  })

  it('dumbbells follow the max: 0 means none even if listed, above 0 means dumbbells', () => {
    expect(here(['dumbbells'], { dumbbellMaxLb: 0 }).has('dumbbells')).toBe(false)
    expect(here([], { dumbbellMaxLb: 25 }).has('dumbbells')).toBe(true)
    expect(here(['dumbbells'], { dumbbellMaxLb: 80 }).has('dumbbells')).toBe(true)
  })

  it('an item newer than the gym\'s list is here at a gym started from Planet Fitness\'s list, not at one started empty', () => {
    const newer = [...vocabulary, item('stability-ball', 'Stability ball', [], { addedIn: 2 }), item('kettlebell-rack', 'Kettlebells', [], { addedIn: 2 })]
    const pfList = [...planetFitness, 'stability-ball']
    const at = (startedFrom: Location['startedFrom'], present: EquipmentId[] = []) =>
      availableEquipment(location(present, { startedFrom, listVersion: 1 }), newer, pfList, KIT)
    expect(at('planet-fitness').has('stability-ball')).toBe(true)
    expect(at('empty').has('stability-ball')).toBe(false)
    // Only items Planet Fitness's list has; and a ticked item is here wherever the gym started.
    expect(at('planet-fitness').has('kettlebell-rack')).toBe(false)
    expect(at('empty', ['stability-ball']).has('stability-ball')).toBe(true)
    // Not new to a gym whose list already has the item's version: then `present` alone decides.
    expect(availableEquipment(location([], { startedFrom: 'planet-fitness', listVersion: 2 }), newer, pfList, KIT).has('stability-ball')).toBe(false)
  })

  it('a mark-off wins over the list and the new-item rule; the kit is never marked off', () => {
    const markedOff = [{ id: 'smith-machine', on: '2026-11-10' }, { id: 'ankle-strap', on: '2026-11-10' }]
    const available = here(['smith-machine', 'mats'], { markedOff })
    expect(available.has('smith-machine')).toBe(false)
    expect(available.has('mats')).toBe(true)
    expect(available.has('ankle-strap')).toBe(true)
  })
})

describe('missingFor', () => {
  it('lists what does not hold, in order; anyOf holds on any one', () => {
    const requires: Requirement[] = ['mats', { anyOf: ['lat-pulldown', 'back-extension-bench'] }]
    expect(missingFor(requires, new Set(['mats', 'back-extension-bench']))).toEqual([])
    expect(missingFor(requires, new Set(['lat-pulldown']))).toEqual(['mats'])
    expect(missingFor(requires, new Set())).toEqual(requires)
    expect(missingFor([], new Set())).toEqual([])
  })
})

describe('routeSlot', () => {
  it('a home-like gym runs every slot\'s own exercise', () => {
    for (const s of allSlots) expect(routeSlot(s, byId, home), s.id).toEqual({ kind: 'own', exerciseId: s.exerciseId, passedOver: [] })
  })

  it('no seated press: A1 moves to the 45° press and says why', () => {
    const available = here(['leg-press-45', 'smith-machine', 'flat-bench'], { dumbbellMaxLb: 80 })
    expect(routeSlot(squat, byId, available)).toEqual({
      kind: 'moved',
      exerciseId: 'leg-press-45',
      passedOver: [{ exerciseId: 'leg-press', missing: ['seated-leg-press'] }],
    })
  })

  it('a hotel with 25 lb dumbbells and a bench: A1 moves to the goblet squat to a bench', () => {
    const hotel = here(['flat-bench'], { dumbbellMaxLb: 25 })
    expect(routeSlot(squat, byId, hotel)).toEqual({
      kind: 'moved',
      exerciseId: 'goblet-squat-bench',
      passedOver: [
        { exerciseId: 'leg-press', missing: ['seated-leg-press'] },
        { exerciseId: 'leg-press-45', missing: ['leg-press-45'] },
        { exerciseId: 'smith-box-squat', missing: ['smith-machine'] },
      ],
    })
  })

  it('Smith only: the standing calf raise runs (leg press or Smith)', () => {
    expect(routeSlot(calf, byId, here(['smith-machine']))).toMatchObject({ kind: 'own', exerciseId: 'standing-calf-raise' })
  })

  it('back-extension bench and mat, no pulldown: Nordics run', () => {
    expect(routeSlot(nordics, byId, here(['back-extension-bench', 'mats']))).toMatchObject({ kind: 'own', exerciseId: 'nordic-negatives' })
    expect(routeSlot(nordics, byId, here(['back-extension-bench', 'seated-leg-curl']))).toMatchObject({ kind: 'moved', exerciseId: 'seated-leg-curl' })
  })

  it('an empty kit: the ankle-strap exercise moves (C8 to the abductor machine); with the band, to the band walk', () => {
    const gym = ['cable-station', 'hip-abductor-machine', 'flat-bench']
    expect(routeSlot(abduction, byId, here(gym, {}, []))).toEqual({
      kind: 'moved',
      exerciseId: 'hip-abductor-machine',
      passedOver: [
        { exerciseId: 'cable-hip-abduction', missing: ['ankle-strap'] },
        { exerciseId: 'lateral-band-walk', missing: ['mini-band'] },
      ],
    })
    expect(routeSlot(abduction, byId, here(gym, {}, ['mini-band']))).toMatchObject({ kind: 'moved', exerciseId: 'lateral-band-walk' })
  })

  it('nothing from the slot\'s list here: none, keeping the own exercise, every entry passed over', () => {
    // The split squat needs nothing, so the step-up slot always has somewhere to go.
    expect(routeSlot(stepUp, byId, here([]))).toMatchObject({ kind: 'moved', exerciseId: 'split-squat' })
    const hotel = here([], {}, [])
    expect(routeSlot(abduction, byId, hotel)).toEqual({
      kind: 'none',
      exerciseId: 'cable-hip-abduction',
      passedOver: [
        { exerciseId: 'cable-hip-abduction', missing: ['cable-station', 'ankle-strap'] },
        { exerciseId: 'lateral-band-walk', missing: ['mini-band'] },
        { exerciseId: 'hip-abductor-machine', missing: ['hip-abductor-machine'] },
        { exerciseId: 'copenhagen-plank-short', missing: ['flat-bench'] },
      ],
    })
  })

  it('a slot with no substitutions is own or none, never moved', () => {
    const lone = slot('b-4', 'goblet-squat-bench')
    expect(routeSlot(lone, byId, here(['flat-bench'], { dumbbellMaxLb: 25 })).kind).toBe('own')
    expect(routeSlot(lone, byId, here(['flat-bench']))).toMatchObject({ kind: 'none', exerciseId: 'goblet-squat-bench' })
  })

  it('an exercise missing from the lookup is a data error, not a silent skip', () => {
    expect(() => routeSlot(slot('x', 'nope'), byId, home)).toThrow(/unknown exercise: nope/)
  })
})

describe('fallbacksAfter', () => {
  it('offers only what comes after the current exercise in the program\'s order, and is here', () => {
    expect(slotOrder(squat)).toEqual(['leg-press', 'leg-press-45', 'smith-box-squat', 'goblet-squat-bench'])
    expect(fallbacksAfter(squat, 'leg-press', byId, home).map((e) => e.id)).toEqual(['leg-press-45', 'smith-box-squat', 'goblet-squat-bench'])
    expect(fallbacksAfter(squat, 'leg-press', byId, here(['smith-machine', 'flat-bench'])).map((e) => e.id)).toEqual(['smith-box-squat'])
  })

  it('never returns the current exercise or an earlier one, even when those are here', () => {
    for (const current of slotOrder(squat)) {
      const after = fallbacksAfter(squat, current, byId, home).map((e) => e.id)
      const earlierOrSame = slotOrder(squat).slice(0, slotOrder(squat).indexOf(current) + 1)
      expect(after, current).not.toContain(current)
      for (const id of earlierOrSame) expect(after, `${current} offers ${id}`).not.toContain(id)
    }
    expect(fallbacksAfter(squat, 'smith-box-squat', byId, home).map((e) => e.id)).toEqual(['goblet-squat-bench'])
    expect(fallbacksAfter(squat, 'goblet-squat-bench', byId, home)).toEqual([])
  })

  it('a back-off from the step-up with no stair goes to the split squat, never back', () => {
    const noStair = here(['step-platforms'])
    expect(fallbacksAfter(stepUp, 'step-up', byId, noStair).map((e) => e.id)).toEqual(['split-squat'])
    expect(fallbacksAfter(stepUp, 'step-up-stair', byId, home).map((e) => e.id)).toEqual(['split-squat'])
  })

  it('an exercise not on the slot\'s list has nothing ahead of it: every entry here, never itself', () => {
    expect(fallbacksAfter(squat, 'dead-bug', byId, here(['smith-machine', 'flat-bench'], { dumbbellMaxLb: 25 })).map((e) => e.id)).toEqual([
      'smith-box-squat',
      'goblet-squat-bench',
    ])
  })
})

describe('stageCeiling', () => {
  it('mat, no bosu: the Phase 2 ladder stops at folded mat, eyes closed (index 2), before the bosu', () => {
    const mats = here(['mats'])
    expect(routeSlot(balance, byId, mats).exerciseId).toBe('balance-mat-bosu')
    const ceiling = stageCeiling(exercise('balance-mat-bosu'), mats)
    expect(ceiling).toBe(2)
    expect(exercise('balance-mat-bosu').stages?.[ceiling ?? -1]).toBe('folded mat, eyes closed')
  })

  it('neither mat nor bosu: the slot moves to single-leg balance, which stops before the folded mat (index 1)', () => {
    const bare = here([])
    expect(routeSlot(balance, byId, bare)).toMatchObject({ kind: 'moved', exerciseId: 'single-leg-balance' })
    expect(stageCeiling(exercise('single-leg-balance'), bare)).toBe(1)
  })

  it('null when every stage can run, or the exercise has no stages', () => {
    const both = here(['mats', 'bosu'])
    expect(stageCeiling(exercise('balance-mat-bosu'), both)).toBeNull()
    expect(stageCeiling(exercise('single-leg-balance'), both)).toBeNull()
    expect(stageCeiling(exercise('leg-press'), here([]))).toBeNull()
    expect(stageCeiling({ stages: ['a', 'b'] }, here([]))).toBeNull()
  })

  it('-1 when not even the first stage can run: a bosu and no mat', () => {
    expect(stageCeiling(exercise('balance-mat-bosu'), here(['bosu']))).toBe(-1)
  })
})

describe('run swaps here', () => {
  it('lists both swaps, elliptical then rower, each here or not', () => {
    expect(runSwapsHere(here(['elliptical', 'rower']))).toEqual([
      { type: 'elliptical-swap', here: true },
      { type: 'rower-swap', here: true },
    ])
    expect(runSwapsHere(here(['rower']))).toEqual([
      { type: 'elliptical-swap', here: false },
      { type: 'rower-swap', here: true },
    ])
  })

  it('a Hold day suggests the first one here; with neither machine, no suggestion', () => {
    expect(suggestedRunSwap(here(['elliptical', 'rower']))).toBe('elliptical-swap')
    expect(suggestedRunSwap(here(['rower']))).toBe('rower-swap')
    expect(suggestedRunSwap(here(['treadmill']))).toBeNull()
  })
})

describe('matchTyped', () => {
  const none: EquipmentId[] = []

  it('normalizes case, accents, punctuation and spaces', () => {
    expect(normalizeTyped('  45° Leg-Press!! ')).toBe('45 leg press')
    expect(normalizeTyped('Bosú   BALL')).toBe('bosu ball')
  })

  it('empty text, or only punctuation, is empty', () => {
    expect(matchTyped('', vocabulary, none)).toEqual({ kind: 'empty' })
    expect(matchTyped('   ', vocabulary, none)).toEqual({ kind: 'empty' })
    expect(matchTyped(' -- ', vocabulary, none)).toEqual({ kind: 'empty' })
  })

  it('an exact name or alias is known, or already when the gym has it', () => {
    expect(matchTyped('Bosu ball', vocabulary, none)).toEqual({ kind: 'known', id: 'bosu' })
    expect(matchTyped('  BOSU-ball. ', vocabulary, none)).toEqual({ kind: 'known', id: 'bosu' })
    expect(matchTyped('Bosu or balance pad', vocabulary, none)).toEqual({ kind: 'known', id: 'bosu' })
    expect(matchTyped('45 degree leg-press', vocabulary, none)).toEqual({ kind: 'known', id: 'leg-press-45' })
    expect(matchTyped('bosu ball', vocabulary, ['bosu', 'mats'])).toEqual({ kind: 'already', id: 'bosu' })
  })

  it('"Rowing machine" suggests Rower and Seated row; "machine" alone only ranks', () => {
    expect(matchTyped('Rowing machine', vocabulary, none)).toEqual({ kind: 'suggest', ids: ['rower', 'seated-row'] })
  })

  it('a bare "leg press" suggests both presses: the items every word points at', () => {
    expect(matchTyped('leg press', vocabulary, none)).toEqual({ kind: 'suggest', ids: ['seated-leg-press', 'leg-press-45'] })
  })

  it('on a tie, an item whose name the typed words cover goes first', () => {
    expect(matchTyped('incline bench', vocabulary, none)).toEqual({ kind: 'suggest', ids: ['flat-bench', 'back-extension-bench'] })
  })

  it('suggests at most three, rarest words first', () => {
    // "cable" points at three items and "bench" at two: five candidates. The rarer word's items rank
    // first; of the cable three, the one with a name the words cover ("cable") is kept.
    expect(matchTyped('cable bench', vocabulary, none)).toEqual({ kind: 'suggest', ids: ['flat-bench', 'back-extension-bench', 'cable-station'] })
  })

  it('unknown when nothing shares a word\'s first three letters, or a vague word points at too much', () => {
    expect(matchTyped('kettlebells', vocabulary, none)).toEqual({ kind: 'unknown' })
    expect(matchTyped('machine', vocabulary, none)).toEqual({ kind: 'unknown' })
    expect(matchTyped('ab', vocabulary, none)).toEqual({ kind: 'unknown' })
  })

  it('never ticks anything itself', () => {
    const present = Object.freeze(['mats']) as readonly EquipmentId[]
    matchTyped('Bosu ball', vocabulary, present)
    matchTyped('Rowing machine', vocabulary, present)
    expect(present).toEqual(['mats'])
  })
})

describe('locationCoverage', () => {
  const template: SessionTemplate = {
    id: 'fx-a',
    phase: 2,
    letter: 'A',
    slots: [
      slot('prep', 'step-up', [], { order: 1, phaseWeeks: [3, null] }),
      { ...squat, order: 2 },
      { ...abduction, order: 3 },
      { ...balance, order: 4 },
      slot('dead', 'dead-bug', [], { order: 5 }),
    ],
  }

  it('lists the slots that move or have nothing here, for the slots that run that week', () => {
    const hotel = here(['flat-bench'], { dumbbellMaxLb: 25 }, [])
    const moves = [
      { slotId: 'a-1', from: 'leg-press', to: 'goblet-squat-bench', kind: 'moved', missing: ['seated-leg-press'] },
      { slotId: 'c-8', from: 'cable-hip-abduction', to: 'copenhagen-plank-short', kind: 'moved', missing: ['cable-station', 'ankle-strap'] },
      { slotId: 'p2a-7', from: 'balance-mat-bosu', to: 'single-leg-balance', kind: 'moved', missing: [{ anyOf: ['mats', 'bosu'] }] },
    ]
    expect(locationCoverage([template], 1, byId, hotel)).toEqual([{ templateId: 'fx-a', moves }])
    expect(locationCoverage([template], 3, byId, hotel)).toEqual([
      { templateId: 'fx-a', moves: [{ slotId: 'prep', from: 'step-up', to: 'step-up', kind: 'none', missing: ['step-platforms'] }, ...moves] },
    ])
  })

  it('a home-like gym changes nothing', () => {
    expect(locationCoverage([template], 3, byId, home)).toEqual([{ templateId: 'fx-a', moves: [] }])
  })
})

describe('forNextProgramUpdate', () => {
  it('keeps typed extras with gym and date, then list items a gym has that no exercise uses', () => {
    const hotel = location(['treadmill', 'mats', 'rower', 'bosu', 'smith-machine'], {
      name: 'Marriott Downtown',
      extras: [{ id: 'x1', text: 'kettlebells', addedOn: '2026-11-10' }],
    })
    const oldGym = location(['elliptical', 'treadmill'], { name: 'Old gym', archived: true, markedOff: [{ id: 'treadmill', on: '2026-11-12' }] })
    expect(forNextProgramUpdate([hotel, oldGym], vocabulary, [...exercises, ex('elliptical-easy', ['elliptical'])])).toEqual([
      { text: 'kettlebells', locationName: 'Marriott Downtown', addedOn: '2026-11-10' },
      // List order; the bosu is used by a stage and an anyOf, mats and the Smith by requires.
      { text: 'Rower', locationName: 'Marriott Downtown' },
      { text: 'Treadmill', locationName: 'Marriott Downtown' },
      // An archived gym's notes stay; a marked-off item is not there to note.
    ])
    expect(forNextProgramUpdate([location([], { name: 'Old gym', archived: true, extras: [{ id: 'x2', text: 'sled', addedOn: '2026-11-03' }] })], vocabulary, exercises)).toEqual([
      { text: 'sled', locationName: 'Old gym', addedOn: '2026-11-03' },
    ])
  })

  it('an item counts as used through anyOf and stageRequires, not only plain requires', () => {
    const onlyStages = [ex('ladder', [], { stages: ['a', 'b'], stageRequires: [[], ['bosu']] })]
    const onlyAnyOf = [ex('either', [{ anyOf: ['rower', 'treadmill'] }])]
    const gym = location(['bosu', 'rower', 'treadmill'])
    expect(forNextProgramUpdate([gym], vocabulary, onlyStages).map((n) => n.text)).toEqual(['Rower', 'Treadmill'])
    expect(forNextProgramUpdate([gym], vocabulary, onlyAnyOf).map((n) => n.text)).toEqual(['Bosu or balance pad'])
  })
})
