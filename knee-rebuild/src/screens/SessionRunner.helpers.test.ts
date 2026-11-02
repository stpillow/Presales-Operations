import { describe, expect, it } from 'vitest'
import { exerciseById, program } from '../program/program.ts'
import type { SlotRoute } from '../rules/equipment.ts'
import type { Prescription } from '../rules/prescription.ts'
import { swapOffer } from '../rules/runnerGym.ts'
import type { Exercise, SetLog, Slot } from '../schema/index.ts'
import {
  buildSet,
  countField,
  countLabel,
  countWords,
  doneWords,
  draftFromSet,
  durationWords,
  heldBarWords,
  itemInSentence,
  loadLabel,
  loadMax,
  loadWords,
  loggedMaxPain,
  markedWords,
  markHereLabel,
  markOffLabel,
  mergeSwaps,
  movedByEngine,
  movedWords,
  nothingHereWords,
  notHereEntries,
  notHereWords,
  notInBagWords,
  notLoggedLabels,
  offerNotes,
  parseStoredSlotIds,
  parseStoredSwaps,
  prescriptionWords,
  rackCappedWords,
  rangeStopOptions,
  routeLines,
  setWords,
  showsLoad,
  swapChoices,
  swapsFromSets,
  swapValue,
  warmUpWords,
  withoutEnginePicks,
} from './SessionRunner.helpers.ts'

const ex = (over: Partial<Exercise> = {}): Exercise => ({ id: 'leg-press', name: 'Leg press', pattern: 'squat', equipment: 'press', loadType: 'stack', loadUnit: 'plate', increment: 1, loadDirection: 'up', unilateral: false, requires: [], ...over })
const slot = (over: Partial<Slot> = {}): Slot => ({ id: 'p1a-1', order: 1, label: '1', exerciseId: 'leg-press', sets: 3, repsMin: 10, repsMax: 12, repUnit: 'reps', unilateral: false, injuredOnly: false, prescriptionText: '3 × 10–12', cues: [], progressionRule: 'double-progression', substitutionIds: ['leg-press-45'], optional: false, rpeTarget: 6, rpeTargetEnd: 7, ...over })
const rx = (over: Partial<Prescription> = {}): Prescription => ({ exerciseId: 'leg-press', side: 'both', sets: 3, load: 8, loadUnit: 'plate', repsTarget: 10, repUnit: 'reps', basis: 'progress-load', note: '', ...over })
const set = (over: Partial<SetLog> = {}): SetLog => ({ id: 'x', workoutId: 'w1', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber: 1, side: 'both', load: 8, loadUnit: 'plate', reps: 12, rpe: 7, painDuring: 2, stopped: false, loggedAt: '2026-11-03T22:00:00.000Z', ...over })

describe('fields and words', () => {
  it('seconds log as seconds; everything else as reps, labelled by unit', () => {
    expect(countField('seconds')).toBe('seconds')
    expect(countField('minutes')).toBe('reps')
    expect(countLabel('yards')).toBe('Yards')
    expect(countLabel('minutes')).toBe('Minutes')
  })
  it('shows a load field only where a load exists', () => {
    expect(showsLoad(ex())).toBe(true)
    expect(showsLoad(ex({ loadType: 'bodyweight' }))).toBe(false)
    expect(showsLoad(ex({ loadType: 'step-height', holdsLoad: 'dumbbell-each' }))).toBe(true)
    expect(showsLoad(ex({ loadType: 'step-height' }))).toBe(false)
  })
  it('caps dumbbell fields at the rack', () => {
    expect(loadMax(ex({ loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5 }), 80)).toBe(80)
    expect(loadMax(ex(), 80)).toBeGreaterThan(80)
  })
  it('says loads and prescriptions in words', () => {
    expect(loadWords(8, ex())).toBe('plate 8')
    expect(loadWords(90, ex({ loadUnit: 'lb', increment: 5 }))).toBe('90 lb')
    expect(loadWords(40, ex({ loadUnit: 'lb', increment: 5, loadDirection: 'down' }))).toBe('assist 40 lb')
    expect(loadLabel(ex({ loadUnit: 'lb', increment: 5 }))).toBe('Weight (lb)')
    expect(loadLabel(ex({ loadUnit: 'lb', increment: 5, loadDirection: 'down' }))).toBe('Assist (lb)')
    expect(loadLabel(ex())).toBe('Plate')
    expect(loadWords(null, ex())).toBe('load to pick')
    expect(loadWords(20, ex({ loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5 }))).toBe('20 lb each')
    expect(prescriptionWords(rx(), slot(), ex())).toBe('3 × 10 · RPE 6→7 · plate 8')
    expect(prescriptionWords(rx({ perSet: [{ load: 8, reps: 12 }, { load: 8, reps: 11 }] }), slot(), ex())).toBe('3 × 12, 11 · RPE 6→7 · plate 8')
  })
  it('says a set in words, including unrated pain and a stop', () => {
    expect(setWords(set(), 'reps', ex())).toBe('12 × plate 8 · RPE 7 · pain 2')
    expect(setWords(set({ painDuring: undefined, stopped: true, stopReason: 'sharp-joint-line-pain' }), 'reps', ex())).toBe('12 × plate 8 · RPE 7 · pain not rated · stopped: sharp joint-line pain')
  })
  it('offers only the engine’s range stops, never past the phase stop', () => {
    expect(rangeStopOptions(45)).toEqual([45])
    expect(rangeStopOptions(30)).toEqual([45, 30])
  })
})

describe('buildSet and draftFromSet', () => {
  it('stores seconds as seconds, drops unrated pain and RPE, records a stop', () => {
    const plank = slot({ repUnit: 'seconds' })
    const s = buildSet({ workoutId: 'w1', slot: plank, repUnit: 'seconds', exercise: ex({ loadType: 'time', loadUnit: 's', increment: 5 }), side: 'right', setNumber: 1, draft: { load: 0, count: 20, rpe: null, pain: null }, loggedAt: 't', stop: 'form' })
    expect(s).toMatchObject({ seconds: 20, stopped: true, stopReason: 'form', loadUnit: 's', load: 0 })
    expect(s.reps).toBeUndefined()
    expect(s.painDuring).toBeUndefined()
    expect(s.rpe).toBeUndefined()
  })
  it('stores a step-up’s dumbbells in lb with its height', () => {
    const stepUp = ex({ id: 'step-up', loadType: 'step-height', loadUnit: 'in', increment: 2, holdsLoad: 'dumbbell-each' })
    expect(buildSet({ workoutId: 'w1', slot: slot(), repUnit: 'reps', exercise: stepUp, side: 'right', setNumber: 1, draft: { load: 20, count: 10, rpe: 6, pain: 1, heightIn: 6 }, loggedAt: 't' })).toMatchObject({ load: 20, loadUnit: 'lb', heightIn: 6, reps: 10 })
  })
  it('stamps rackCapped when the side’s prescription was rack-capped, so the set never counts as clean; otherwise no field (M4b)', () => {
    const rdl = ex({ id: 'db-rdl', loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5 })
    const input = { workoutId: 'w1', slot: slot(), repUnit: 'reps' as const, exercise: rdl, side: 'both' as const, setNumber: 1, draft: { load: 25, count: 10, rpe: 7, pain: 1 }, loggedAt: 't' }
    expect(buildSet({ ...input, rackCapped: true })).toMatchObject({ load: 25, loadUnit: 'lb', rackCapped: true })
    expect('rackCapped' in buildSet({ ...input, rackCapped: false })).toBe(false)
    expect('rackCapped' in buildSet(input)).toBe(false)
  })
  it('round-trips a logged set into a draft', () => {
    expect(draftFromSet(set())).toEqual({ load: 8, count: 12, rpe: 7, pain: 2 })
  })
})

describe('swaps', () => {
  const plans = [{ slot: slot(), prescriptions: [{ exerciseId: 'leg-press' }] }]
  it('recovers a user swap from the sets', () => {
    expect(swapsFromSets(plans, [set({ exerciseId: 'leg-press-45' })])).toEqual({ 'p1a-1': 'leg-press-45' })
  })
  it('does not mistake an engine move for a swap', () => {
    const moved = [{ slot: slot(), prescriptions: [{ exerciseId: 'smith-box-squat' }] }]
    expect(swapsFromSets(moved, [set({ exerciseId: 'smith-box-squat' })])).toEqual({})
    expect(swapsFromSets(plans, [set()])).toEqual({})
  })
  it('recovers a choice of the slot’s own exercise when the engine had moved it: the gym routed it, Shawn ran it anyway (M4b)', () => {
    const moved = [{ slot: slot(), prescriptions: [{ exerciseId: 'goblet-squat-bench' }] }]
    expect(swapsFromSets(moved, [set()])).toEqual({ 'p1a-1': 'leg-press' })
  })
  it('stored choices win, and a stored null returns the slot to its own exercise', () => {
    expect(mergeSwaps({ a: 'x' }, { a: null, b: 'y' })).toEqual({ a: undefined, b: 'y' })
  })
  it('a stored swap of what the plan now runs without it is no swap: a mark since made it the gym’s pick (M4b)', () => {
    const engine = new Map([['a', 'leg-press'], ['b', 'goblet-squat-bench']])
    expect(withoutEnginePicks({ a: 'leg-press', b: 'smith-box-squat', c: 'x', d: undefined }, engine)).toEqual({ a: undefined, b: 'smith-box-squat', c: 'x', d: undefined })
  })
  it('parses the stored Do it anyway slots defensively', () => {
    expect(parseStoredSlotIds(null)).toEqual([])
    expect(parseStoredSlotIds('not json')).toEqual([])
    expect(parseStoredSlotIds('{"a":1}')).toEqual([])
    expect(parseStoredSlotIds('["p2a-1", 3, null, "p2a-7"]')).toEqual(['p2a-1', 'p2a-7'])
  })
  it('parses stored swaps defensively', () => {
    expect(parseStoredSwaps(null)).toEqual({})
    expect(parseStoredSwaps('not json')).toEqual({})
    expect(parseStoredSwaps('[1]')).toEqual({})
    expect(parseStoredSwaps('{"a":"x","b":null,"c":3}')).toEqual({ a: 'x', b: null })
  })
})

describe('summary helpers', () => {
  it('finds the highest logged pain', () => {
    expect(loggedMaxPain([set({ painDuring: 2 }), set({ painDuring: 4 }), set({ painDuring: undefined })])).toBe(4)
    expect(loggedMaxPain([set({ painDuring: undefined })])).toBeNull()
  })
  it('says a duration in words', () => {
    expect(durationWords('2026-11-03T22:00:00Z', '2026-11-03T22:48:00Z')).toBe('48 min')
    expect(durationWords('2026-11-03T22:00:00Z', '2026-11-04T00:05:00Z')).toBe('2 h 5 min')
    expect(durationWords(undefined, 'x')).toBeNull()
    expect(durationWords('2026-11-03T22:00:00Z', '2026-11-03T22:00:20Z')).toBeNull()
  })
})

describe('per-side words', () => {
  it('says "each side" on two-sided slots the program counts per side', () => {
    const pallof = slot({ repsMin: 10, repsMax: 10, perSideLabel: 'each side', rpeTarget: undefined, rpeTargetEnd: undefined })
    expect(prescriptionWords(rx({ sets: 2, repsTarget: 10 }), pallof, ex())).toBe('2 × 10 each side · plate 8')
    expect(countWords(10, 'reps', pallof)).toBe('10 reps each side')
    expect(countWords(30, 'seconds', slot({ unilateral: true, perSideLabel: 'each leg' }))).toBe('30 s')
  })
})

describe('the gym in words (M4b, design section 4)', () => {
  const items = program.equipment
  const hotel = 'Hotel gym'

  it('names a list item inside a sentence, keeping the Smith machine’s capital', () => {
    expect(itemInSentence('Seated leg press')).toBe('seated leg press')
    expect(itemInSentence('Smith machine')).toBe('Smith machine')
    expect(itemInSentence('45° leg press')).toBe('45° leg press')
  })

  it('a moved slot: what isn’t here, what runs instead, and what else was passed over', () => {
    const route: SlotRoute = {
      kind: 'moved',
      exerciseId: 'goblet-squat-bench',
      passedOver: [
        { exerciseId: 'leg-press', missing: ['seated-leg-press'] },
        { exerciseId: 'leg-press-45', missing: ['leg-press-45'] },
        { exerciseId: 'smith-box-squat', missing: ['smith-machine'] },
      ],
    }
    expect(movedWords(route, 'Goblet squat to a bench', hotel, items)).toBe('Not at Hotel gym: Seated leg press. Using Goblet squat to a bench (no 45° leg press, no Smith machine).')
  })
  it('a moved slot names what the own exercise lacks once, and an item left out of the bag as the bag’s', () => {
    const one: SlotRoute = { kind: 'moved', exerciseId: 'goblet-squat-bench', passedOver: [{ exerciseId: 'smith-box-squat', missing: ['smith-machine', 'flat-bench'] }, { exerciseId: 'x', missing: ['flat-bench'] }] }
    expect(movedWords(one, 'Split squat', hotel, items)).toBe('Not at Hotel gym: Smith machine and flat bench. Using Split squat.')
    const strap: SlotRoute = { kind: 'moved', exerciseId: 'lateral-band-walk', passedOver: [{ exerciseId: 'cable-hip-abduction', missing: ['cable-station', 'ankle-strap'] }] }
    expect(movedWords(strap, 'Lateral band walk', hotel, items)).toBe('Not at Hotel gym: Cable station. Not in your bag: Cable ankle strap. Using Lateral band walk.')
    const bosu: SlotRoute = { kind: 'moved', exerciseId: 'single-leg-balance', passedOver: [{ exerciseId: 'balance-mat-bosu', missing: ['mats'] }] }
    expect(movedWords(bosu, 'Single-leg balance', hotel, items)).toBe('Not at Hotel gym: Mats. Using Single-leg balance.')
  })

  it('a slot with nothing here says what its exercise needs', () => {
    expect(nothingHereWords('Step-off landing from a 6–8 in. step, stuck for 2 s', ['step-platforms'], items)).toBe('Nothing here for Step-off landing from a 6–8 in. step, stuck for 2 s (needs step platforms).')
    expect(nothingHereWords('Single-leg calf raise on a step', [{ anyOf: ['step-platforms', 'stair'] }], items)).toBe('Nothing here for Single-leg calf raise on a step (needs step platforms or stair).')
  })

  it('offers to mark an item here, or not here, by its list name', () => {
    expect(markHereLabel('step-platforms', items)).toBe('Mark step platforms here')
    expect(markHereLabel('smith-machine', items)).toBe('Mark Smith machine here')
    expect(markOffLabel('smith-machine', items)).toBe("Smith machine isn't here: mark it")
    expect(markOffLabel('step-platforms', items)).toBe("Step platforms aren't here: mark them")
  })

  it('says what no mark at a gym adds: a carried item is the bag’s', () => {
    expect(notInBagWords(['ankle-strap'], items)).toBe('Not in your bag: cable ankle strap. "In your bag" in Where you train adds it.')
  })
  it('a rack-capped prescription says it won’t count as clean', () => {
    expect(rackCappedWords(25)).toBe("Rack-capped at 25 lb: this session won't count as clean.")
    expect(rackCappedWords(0)).toBe("Rack-capped: no dumbbells here, so this session won't count as clean.")
  })

  it('the warm-up drops the bike where there is none, and says nothing else is written for it', () => {
    expect(warmUpWords(5, true)).toEqual({ line: 'Warm-up · bike 5 min · knee circuit 5 min', noBike: null })
    expect(warmUpWords(10, false)).toEqual({ line: 'Warm-up · knee circuit 10 min', noBike: 'No upright bike here; nothing else is written for it.' })
    expect(warmUpWords(undefined, true).line).toBe('Warm-up · bike 5 min · knee circuit 5 min')
  })

  it('Swap lists the slot’s own exercise and its substitutions in order, each here or not with what it needs', () => {
    const own = exerciseById('leg-press')
    const subs = ['leg-press-45', 'smith-box-squat', 'goblet-squat-bench'].map(exerciseById)
    const choices = swapChoices(own, subs, new Set(['flat-bench', 'dumbbells']), items)
    expect(choices.map((c) => [c.exercise.id, c.here, c.words])).toEqual([
      ['leg-press', false, 'Not here · needs seated leg press'],
      ['leg-press-45', false, 'Not here · needs 45° leg press'],
      ['smith-box-squat', false, 'Not here · needs Smith machine'],
      ['goblet-squat-bench', true, 'Here'],
    ])
    expect(choices[2]?.missing).toEqual(['smith-machine'])
  })

  it('Finish lists the slots the gym changed, in words', () => {
    const route = (kind: SlotRoute['kind'], from: string): SlotRoute => ({ kind, exerciseId: from, passedOver: [{ exerciseId: from, missing: ['x'] }] })
    const plans = [
      { slot: { id: 'a1', label: '1' }, exercise: { id: 'goblet-squat-bench', name: 'Goblet squat to a bench' }, route: route('moved', 'leg-press') },
      { slot: { id: 'a2', label: '2' }, exercise: { id: 'db-rdl', name: 'Dumbbell Romanian deadlift' }, route: { kind: 'own' as const, exerciseId: 'db-rdl', passedOver: [] } },
      { slot: { id: 'a7', label: '7' }, exercise: { id: 'step-off-landing', name: 'Step-off landing' }, route: route('none', 'step-off-landing') },
      { slot: { id: 'a8', label: '8' }, exercise: { id: 'leg-extension', name: 'Leg extension' }, route: route('moved', 'leg-extension') },
    ]
    const entries = notHereEntries(plans, new Set(['a8']), (id) => ({ 'leg-press': 'Leg press, both legs', 'step-off-landing': 'Step-off landing', 'leg-extension': 'Leg extension' })[id] ?? id)
    expect(entries.map((e) => e.label)).toEqual(['1', '7', '8'])
    expect(notHereWords(hotel, entries)).toBe('Not at Hotel gym: 1 Leg press, both legs (Goblet squat to a bench instead); 7 Step-off landing (nothing here); 8 Leg extension (done anyway).')
    const anyway = notHereEntries([plans[2] as (typeof plans)[number]], new Set(['a7']), () => 'Step-off landing')
    expect(notHereWords(hotel, anyway)).toBe('Not at Hotel gym: 7 Step-off landing (nothing here; done anyway).')
    expect(notHereWords(hotel, [])).toBeNull()
  })

  const nameOf = (id: string) => exerciseById(id).name

  it('the card says what the gym did to the slot, unless a swap chose, and a rack cap', () => {
    const moved: SlotRoute = { kind: 'moved', exerciseId: 'goblet-squat-bench', passedOver: [{ exerciseId: 'leg-press', missing: ['seated-leg-press'] }] }
    const base = { gymName: hotel, items, nameOf, rackCappedLb: null }
    expect(routeLines({ ...base, route: moved, swapped: false })).toEqual(['Not at Hotel gym: Seated leg press. Using Goblet squat to a bench.'])
    expect(routeLines({ ...base, route: moved, swapped: true })).toEqual([])
    const none: SlotRoute = { kind: 'none', exerciseId: 'step-off-landing', passedOver: [{ exerciseId: 'step-off-landing', missing: ['step-platforms'] }] }
    expect(routeLines({ ...base, route: none, swapped: false })).toEqual(['Nothing here for Step-off landing from a 6–8 in. step, stuck for 2 s (needs step platforms).'])
    const own: SlotRoute = { kind: 'own', exerciseId: 'db-rdl', passedOver: [] }
    expect(routeLines({ ...base, route: own, swapped: false })).toEqual([])
    expect(routeLines({ ...base, route: own, swapped: true, rackCappedLb: 25 })).toEqual(["Rack-capped at 25 lb: this session won't count as clean."])
  })

  it('says the engine moved the card only when the gym did not: the gym’s line says that', () => {
    const moved: SlotRoute = { kind: 'moved', exerciseId: 'goblet-squat-bench', passedOver: [{ exerciseId: 'leg-press', missing: ['seated-leg-press'] }] }
    const own: SlotRoute = { kind: 'own', exerciseId: 'leg-press', passedOver: [] }
    expect(movedByEngine('leg-press', 'goblet-squat-bench', moved, false)).toBe(false)
    expect(movedByEngine('leg-press', 'smith-box-squat', moved, false)).toBe(true)
    expect(movedByEngine('leg-press', 'leg-press-45', own, false)).toBe(true)
    expect(movedByEngine('leg-press', 'leg-press', own, false)).toBe(false)
    expect(movedByEngine('leg-press', 'leg-press-45', own, true)).toBe(false)
  })

  it('a Swap pick of what the gym would run anyway is no swap', () => {
    expect(swapValue('goblet-squat-bench', 'goblet-squat-bench')).toBeNull()
    expect(swapValue('leg-press', 'goblet-squat-bench')).toBe('leg-press')
    expect(swapValue(null, 'goblet-squat-bench')).toBeNull()
  })

  it('turns a mark offer into words and buttons, dropping what is already marked', () => {
    const hotelHas = new Set(['flat-bench', 'dumbbells', 'mini-band'])
    const notHerePick = swapOffer(exerciseById('goblet-squat-bench'), exerciseById('smith-box-squat'), hotelHas, ['ankle-strap', 'mini-band'])
    expect(offerNotes(notHerePick, hotelHas, items)).toEqual({ lines: [], marks: [{ id: 'smith-machine', here: true, label: 'Mark Smith machine here' }] })
    expect(offerNotes(notHerePick, new Set([...hotelHas, 'smith-machine']), items)).toEqual({ lines: [], marks: [] })
    const strap = swapOffer(exerciseById('lateral-band-walk'), exerciseById('cable-hip-abduction'), hotelHas, ['ankle-strap', 'mini-band'])
    expect(offerNotes(strap, hotelHas, items)).toEqual({
      lines: ['Not in your bag: cable ankle strap. "In your bag" in Where you train adds it.'],
      marks: [{ id: 'cable-station', here: true, label: 'Mark cable station here' }],
    })
    const noRack = swapOffer(exerciseById('smith-rdl'), exerciseById('db-rdl'), new Set<string>(), [])
    expect(offerNotes(noRack, new Set<string>(), items)).toEqual({ lines: ["No dumbbells here: each gym's dumbbells are set in Where you train."], marks: [] })
    const pf = new Set(['seated-leg-press', 'flat-bench', 'dumbbells'])
    const herePick = swapOffer(exerciseById('leg-press'), exerciseById('goblet-squat-bench'), pf, [])
    expect(offerNotes(herePick, pf, items)).toEqual({ lines: [], marks: [{ id: 'seated-leg-press', here: false, label: "Seated leg press isn't here: mark it" }] })
    expect(offerNotes(herePick, new Set(['flat-bench', 'dumbbells']), items)).toEqual({ lines: [], marks: [] })
    expect(offerNotes(null, pf, items)).toEqual({ lines: [], marks: [] })
  })

  it('says a mark was saved, and where', () => {
    expect(markedWords(true, 'step-platforms', hotel, items)).toBe('Marked here at Hotel gym: step platforms.')
    expect(markedWords(false, 'smith-machine', hotel, items)).toBe('Marked not here at Hotel gym: Smith machine. Today offers "It\'s back" when it is.')
  })

  it('the Done bar on a slot with nothing here, and the end of the session with such slots left', () => {
    expect(heldBarWords(hotel)).toBe('Nothing at Hotel gym for this slot: Skip, Do it anyway or Swap.')
    expect(doneWords(hotel, [])).toEqual({ heading: 'Every required set is logged', line: 'Optional slots are still open below. Finish when you’re done.', bar: 'Every required set is logged.' })
    expect(doneWords(hotel, ['7 Step-off landing', '8 Lateral step-down'])).toEqual({
      heading: 'Every set Hotel gym can run is logged',
      line: 'Nothing here for 7 Step-off landing, 8 Lateral step-down: tap a row below for Skip, Do it anyway or Swap, or finish.',
      bar: 'Every set Hotel gym can run is logged.',
    })
  })

  it('Finish’s not-logged list leaves out the slots the not-here line already names', () => {
    const plans = [
      { slot: { id: 'a1', label: '1', optional: false }, exercise: { name: 'Goblet squat to a bench' } },
      { slot: { id: 'a7', label: '7', optional: false }, exercise: { name: 'Step-off landing' } },
      { slot: { id: 'a9', label: '9', optional: true }, exercise: { name: 'Elliptical' } },
      { slot: { id: 'a2', label: '2', optional: false }, exercise: { name: 'Dumbbell Romanian deadlift' } },
    ]
    const steps = [
      { key: 'a1:both:1', slotId: 'a1' },
      { key: 'a7:both:1', slotId: 'a7' },
      { key: 'a9:both:1', slotId: 'a9' },
      { key: 'a2:both:1', slotId: 'a2' },
    ]
    expect(notLoggedLabels(plans, steps, new Set(['a2:both:1']), new Set(), new Set(['a7']))).toEqual(['1 Goblet squat to a bench'])
    expect(notLoggedLabels(plans, steps, new Set(), new Set(['a1']), new Set())).toEqual(['7 Step-off landing', '2 Dumbbell Romanian deadlift'])
  })
})
