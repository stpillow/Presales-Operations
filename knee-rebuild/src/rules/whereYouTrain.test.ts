import { describe, expect, it } from 'vitest'
import type { Equipment, EquipmentId, Location } from '../schema/index.ts'
import { availableEquipment, type ChecklistGroup } from './equipment.ts'
import { checklistNotHere, ifNotHere, itemOutcome, nameTaken, newOnList, notHereWrite, rowItems, typedOutcome } from './whereYouTrain.ts'

// Inline fixtures shaped like the seed; the live seed's rows are checked in src/screens/LocationEditor.helpers.test.ts.

function item(id: string, name: string, aliases: string[] = [], extra: Partial<Equipment> = {}): Equipment {
  return { id, name, group: 'Fixture', source: name, aliases, carried: false, hedged: false, addedIn: 1, ...extra }
}

const vocabulary: Equipment[] = [
  item('smith-machine', 'Smith machine', ['smith']),
  item('seated-leg-press', 'Seated leg press', ['seated leg press machine']),
  item('leg-press-45', '45° leg press', ['45 leg press']),
  item('dumbbells', 'Dumbbells', ['dumbbell']),
  item('flat-bench', 'Flat bench', ['bench']),
  item('seated-row', 'Seated row', ['seated row machine']),
  item('hip-abductor-machine', 'Hip abductor machine', ['abductor machine']),
  item('hip-adductor-machine', 'Hip adductor machine', ['adductor machine']),
  item('seated-calf-machine', 'Seated calf machine', ['calf machine']),
  item('bosu', 'Bosu or balance pad', ['bosu', 'bosu ball', 'balance pad'], { hedged: true }),
  item('medicine-ball', 'Medicine ball', ['med ball']),
  item('shoulder-press-machine', 'Shoulder press machine', ['shoulder press']),
  item('rower', 'Rower', ['erg', 'rowing ergometer']),
  item('mats', 'Mats', ['mat'], { addedIn: 2 }),
  item('ankle-strap', 'Cable ankle strap', ['ankle strap'], { carried: true, group: 'Bring' }),
]

function location(present: EquipmentId[], extra: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Marriott Downtown',
    present,
    dumbbellMaxLb: 0,
    startedFrom: 'empty',
    listVersion: 1,
    extras: [],
    markedOff: [],
    createdOn: '2026-11-02',
    archived: false,
    ...extra,
  }
}

const entry = (id: string): ChecklistGroup['items'][number] => ({ item: item(id, id), exerciseIds: [], warmUp: false })

describe('checklistNotHere', () => {
  it("counts the checklist's items that aren't here, in the list's order", () => {
    const checklist: ChecklistGroup[] = [
      { group: 'Squat pattern', items: [entry('smith-machine'), entry('seated-leg-press')] },
      { group: 'Upper body', items: [entry('seated-row')] },
    ]
    expect(checklistNotHere(checklist, new Set(['seated-leg-press']))).toEqual(['smith-machine', 'seated-row'])
    expect(checklistNotHere(checklist, new Set(['smith-machine', 'seated-leg-press', 'seated-row']))).toEqual([])
    expect(checklistNotHere([], new Set())).toEqual([])
  })
})

describe('the substitution table\'s "If not here"', () => {
  const table = [
    { takenOrMissing: 'Leg press', useInstead: 'Smith box squat, then goblet squat to a bench' },
    { takenOrMissing: 'Smith machine', useInstead: 'Goblet squat or Bulgarians with dumbbells' },
    { takenOrMissing: 'Hip abductor or adductor machine', useInstead: 'Cable with ankle strap; mini-band lateral walks; Copenhagen plank' },
    { takenOrMissing: 'Dumbbell bench', useInstead: 'Chest press machine, then Smith bench press' },
    { takenOrMissing: 'Calf machine', useInstead: 'Calf raises on the leg press, then single-leg on a step' },
    { takenOrMissing: 'Bosu or balance pad', useInstead: 'Folded mat, then eyes closed on the floor' },
    { takenOrMissing: 'Medicine ball (Phase 3)', useInstead: 'Cable rotational chop and lift' },
  ]

  it('reads a row by the name or an alias of the item it names', () => {
    expect(rowItems({ takenOrMissing: 'Smith machine' }, vocabulary)).toEqual(['smith-machine'])
    expect(rowItems({ takenOrMissing: 'Calf machine' }, vocabulary)).toEqual(['seated-calf-machine'])
    expect(rowItems({ takenOrMissing: 'Bosu or balance pad' }, vocabulary)).toEqual(['bosu'])
  })

  it("reads program.md's bare leg press as both presses, and the hip row as both hip machines", () => {
    expect(rowItems({ takenOrMissing: 'Leg press' }, vocabulary)).toEqual(['seated-leg-press', 'leg-press-45'])
    expect(rowItems({ takenOrMissing: 'Hip abductor or adductor machine' }, vocabulary)).toEqual(['hip-abductor-machine', 'hip-adductor-machine'])
    expect(rowItems({ takenOrMissing: 'Medicine ball (Phase 3)' }, vocabulary)).toEqual(['medicine-ball'])
  })

  it('gives the dumbbell bench press\'s row to no item: it names an exercise', () => {
    expect(rowItems({ takenOrMissing: 'Dumbbell bench' }, vocabulary)).toEqual([])
    expect(ifNotHere('flat-bench', vocabulary, table)).toBeNull()
    expect(ifNotHere('dumbbells', vocabulary, table)).toBeNull()
  })

  it("finds each item's row, or none where the table gives none", () => {
    expect(ifNotHere('leg-press-45', vocabulary, table)?.useInstead).toBe('Smith box squat, then goblet squat to a bench')
    expect(ifNotHere('seated-leg-press', vocabulary, table)?.useInstead).toBe('Smith box squat, then goblet squat to a bench')
    expect(ifNotHere('hip-adductor-machine', vocabulary, table)?.takenOrMissing).toBe('Hip abductor or adductor machine')
    expect(ifNotHere('seated-calf-machine', vocabulary, table)?.useInstead).toBe('Calf raises on the leg press, then single-leg on a step')
    expect(ifNotHere('rower', vocabulary, table)).toBeNull()
  })
})

describe('newOnList', () => {
  it('flags an item the list added after the gym was made', () => {
    expect(newOnList({ addedIn: 2 }, { listVersion: 1 })).toBe(true)
    expect(newOnList({ addedIn: 1 }, { listVersion: 1 })).toBe(false)
    expect(newOnList({ addedIn: 2 }, { listVersion: 2 })).toBe(false)
  })
})

describe("notHereWrite: what the editor's Not here writes", () => {
  const planetFitness: EquipmentId[] = ['smith-machine', 'mats']

  it("takes the item off the gym's list", () => {
    expect(notHereWrite(location(['smith-machine']), 'smith-machine', vocabulary, planetFitness)).toBe('unlist')
    expect(notHereWrite(location(['smith-machine'], { startedFrom: 'planet-fitness' }), 'smith-machine', vocabulary, planetFitness)).toBe('unlist')
  })

  it("marks off an item new on Planet Fitness's list at a gym started from it, since the list alone would still count it here", () => {
    const hotel = location(['smith-machine'], { startedFrom: 'planet-fitness' })
    expect(availableEquipment(hotel, vocabulary, planetFitness, []).has('mats')).toBe(true)
    expect(notHereWrite(hotel, 'mats', vocabulary, planetFitness)).toBe('mark-off')
  })

  it('unlists the same item at a gym started empty, where it is only here when listed', () => {
    expect(notHereWrite(location(['mats']), 'mats', vocabulary, planetFitness)).toBe('unlist')
  })
})

describe('typed equipment', () => {
  const used = new Set<EquipmentId>(['smith-machine', 'seated-leg-press', 'leg-press-45', 'bosu', 'rower', 'seated-row', 'dumbbells', 'ankle-strap'])
  const here = new Set<EquipmentId>(['smith-machine', 'ankle-strap'])

  it('asks before marking an item a session uses', () => {
    expect(typedOutcome('Bosu ball', vocabulary, used, here)).toEqual({ kind: 'mark', id: 'bosu' })
    expect(typedOutcome('  balance PAD ', vocabulary, used, here)).toEqual({ kind: 'mark', id: 'bosu' })
  })

  it('says an item already here is here', () => {
    expect(typedOutcome('smith', vocabulary, used, here)).toEqual({ kind: 'already', id: 'smith-machine' })
  })

  it('reads an item marked off as not here, so marking it clears the mark', () => {
    const gym = location(['bosu'], { markedOff: [{ id: 'bosu', on: '2026-11-10' }] })
    const available = availableEquipment(gym, vocabulary, [], [])
    expect(typedOutcome('bosu', vocabulary, used, available)).toEqual({ kind: 'mark', id: 'bosu' })
  })

  it("sends the bag and the rack to their own sections: neither is a gym's list", () => {
    expect(typedOutcome('ankle strap', vocabulary, used, here)).toEqual({ kind: 'bag', id: 'ankle-strap' })
    expect(typedOutcome('ankle strap', vocabulary, used, new Set())).toEqual({ kind: 'bag', id: 'ankle-strap' })
    expect(typedOutcome('Dumbbell', vocabulary, used, here)).toEqual({ kind: 'rack' })
  })

  it("keeps an item on the program's list that no session uses", () => {
    expect(typedOutcome('shoulder press', vocabulary, used, here)).toEqual({ kind: 'unused', id: 'shoulder-press-machine' })
    expect(typedOutcome('med ball', vocabulary, used, new Set(['medicine-ball']))).toEqual({ kind: 'already', id: 'medicine-ball' })
  })

  it('offers near misses and never marks them', () => {
    expect(typedOutcome('Rowing machine', vocabulary, used, here)).toEqual({ kind: 'choose', ids: ['rower', 'seated-row'] })
    expect(typedOutcome('abductor adductor', vocabulary, used, here)).toEqual({ kind: 'choose', ids: ['hip-abductor-machine', 'hip-adductor-machine'] })
  })

  it('keeps what matches nothing, and reads nothing typed as nothing', () => {
    expect(typedOutcome('kettlebells', vocabulary, used, here)).toEqual({ kind: 'keep' })
    expect(typedOutcome('   ', vocabulary, used, here)).toEqual({ kind: 'empty' })
  })

  it('reads a picked near miss the way an exact name reads', () => {
    expect(itemOutcome('rower', vocabulary, used, here)).toEqual({ kind: 'mark', id: 'rower' })
    expect(itemOutcome('seated-row', vocabulary, used, new Set(['seated-row']))).toEqual({ kind: 'already', id: 'seated-row' })
    expect(itemOutcome('medicine-ball', vocabulary, used, here)).toEqual({ kind: 'unused', id: 'medicine-ball' })
    expect(itemOutcome('ankle-strap', vocabulary, used, here)).toEqual({ kind: 'bag', id: 'ankle-strap' })
    expect(itemOutcome('dumbbells', vocabulary, used, new Set())).toEqual({ kind: 'rack' })
  })
})

describe('nameTaken', () => {
  const gyms = [
    { id: 'planet-fitness', name: 'Planet Fitness', archived: false },
    { id: 'loc-1', name: 'Marriott Downtown', archived: false },
    { id: 'loc-2', name: 'Hotel gym', archived: true },
  ]

  it('refuses a name another listed gym goes by, case and punctuation aside', () => {
    expect(nameTaken(gyms, 'marriott  downtown', null)).toBe(true)
    expect(nameTaken(gyms, 'Planet-Fitness', null)).toBe(true)
  })

  it('lets a gym keep its own name, and frees the names of archived gyms', () => {
    expect(nameTaken(gyms, 'Marriott Downtown', 'loc-1')).toBe(false)
    expect(nameTaken(gyms, 'Hotel gym', null)).toBe(false)
    expect(nameTaken(gyms, 'Hilton', null)).toBe(false)
  })
})
