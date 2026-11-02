import { describe, expect, it } from 'vitest'
import type { EquipmentId, Exercise, Requirement } from '../schema/index.ts'
import { asksForRack, lacksDumbbells, lacksFromBag, markHereItems, markOffItems, notHereSlots, skipTakesBack, swapOffer } from './runnerGym.ts'

// Inline fixtures shaped like the seed (design section 4); the ids are the seed's own.

function ex(id: string, requires: Requirement[], extra: Partial<Exercise> = {}): Exercise {
  return { id, name: id, pattern: 'squat', equipment: '', loadType: 'bodyweight', loadUnit: 'lb', increment: 5, loadDirection: 'up', unilateral: false, requires, ...extra }
}

const legPress = ex('leg-press', ['seated-leg-press'])
const smithBoxSquat = ex('smith-box-squat', ['smith-machine', 'flat-bench'])
const gobletSquat = ex('goblet-squat-bench', ['dumbbells', 'flat-bench'])
const splitSquat = ex('split-squat', [])
const stepOff = ex('step-off-landing', ['step-platforms'])
const calfRaise = ex('single-leg-calf-raise-step', [{ anyOf: ['step-platforms', 'stair'] }])
const cableAbduction = ex('cable-hip-abduction', ['cable-station', 'ankle-strap'])
const bandWalk = ex('lateral-band-walk', ['mini-band'])
const balance = ex('balance-mat-bosu', [{ anyOf: ['mats', 'bosu'] }], {
  stages: ['folded mat', 'folded mat, slow head turns', 'folded mat, eyes closed', 'bosu', 'bosu, slow head turns', 'bosu, eyes closed'],
  stageRequires: [['mats'], ['mats'], ['mats'], ['bosu'], ['bosu'], ['bosu']],
})
const singleLegBalance = ex('single-leg-balance', [], { stages: ['eyes open', 'eyes closed', 'on a folded mat'], stageRequires: [[], [], ['mats']] })

const here = (...ids: EquipmentId[]): ReadonlySet<EquipmentId> => new Set(ids)
/** The list's carried items (Settings' kit by default). */
const CARRIED: EquipmentId[] = ['ankle-strap', 'mini-band']

describe('notHereSlots: what the run order leaves for Skip or Do it anyway (PROGRAM-QUESTIONS 83)', () => {
  const slots = [
    { slotId: 'a1', route: { kind: 'moved' as const } },
    { slotId: 'a7', route: { kind: 'none' as const } },
    { slotId: 'a8', route: { kind: 'none' as const } },
    { slotId: 'a9', route: { kind: 'own' as const } },
  ]
  it('leaves out only the slots with nothing here', () => {
    expect(notHereSlots(slots, new Set(), new Set(), new Set())).toEqual(new Set(['a7', 'a8']))
  })
  it('runs a slot Shawn picked Do it anyway on, swapped for the session, or already logged a set on', () => {
    expect(notHereSlots(slots, new Set(['a7']), new Set(), new Set())).toEqual(new Set(['a8']))
    expect(notHereSlots(slots, new Set(), new Set(['a8']), new Set())).toEqual(new Set(['a7']))
    expect(notHereSlots(slots, new Set(), new Set(), new Set(['a7', 'a8']))).toEqual(new Set())
  })
})

describe('a slot run at a gym with no dumbbells (M4b review)', () => {
  const dbBench = ex('db-bench-press', ['dumbbells', 'flat-bench'], { loadType: 'dumbbell-each' })
  it('the card asks for the gym’s heaviest dumbbell once the slot runs on an exercise that needs them: its load field stops at the rack', () => {
    expect(asksForRack(dbBench, here('flat-bench'), false)).toBe(true)
    expect(asksForRack(gobletSquat, here(), false)).toBe(true)
  })
  it('not while the slot waits for Skip or Do it anyway, not where dumbbells are here, and not for an exercise that only holds them', () => {
    expect(asksForRack(dbBench, here('flat-bench'), true)).toBe(false)
    expect(asksForRack(dbBench, here('flat-bench', 'dumbbells'), false)).toBe(false)
    // The split squat holds dumbbells without needing them: at a gym with none it is bodyweight (PROGRAM-QUESTIONS 91).
    expect(asksForRack(splitSquat, here(), false)).toBe(false)
  })
  it('Skip takes back Do it anyway until a set is logged on the slot, so the run order passes it again', () => {
    const a3 = { slotId: 'a3', route: { kind: 'none' as const } }
    expect(skipTakesBack(a3, new Set(['a3']), new Set())).toBe(true)
    expect(skipTakesBack(a3, new Set(['a3']), new Set(['a3']))).toBe(false)
    expect(skipTakesBack(a3, new Set(), new Set())).toBe(false)
    // The rack set on the card since: the slot runs here now, and there is nothing to take back.
    expect(skipTakesBack({ slotId: 'a3', route: { kind: 'own' } }, new Set(['a3']), new Set())).toBe(false)
  })
})

describe('markHereItems: "Mark step platforms here"', () => {
  it('offers what the exercise lacks here, in its order', () => {
    expect(markHereItems(stepOff, here(), CARRIED)).toEqual(['step-platforms'])
    expect(markHereItems(smithBoxSquat, here(), CARRIED)).toEqual(['smith-machine', 'flat-bench'])
    expect(markHereItems(smithBoxSquat, here('flat-bench'), CARRIED)).toEqual(['smith-machine'])
  })
  it('offers each option of an either-or', () => {
    expect(markHereItems(calfRaise, here(), CARRIED)).toEqual(['step-platforms', 'stair'])
  })
  it('offers the first stage’s needs when not even that stage runs (a bosu and no mat, PROGRAM-QUESTIONS 76)', () => {
    expect(markHereItems(balance, here('bosu'), CARRIED)).toEqual(['mats'])
  })
  it('never offers dumbbells: the gym’s dumbbell max decides them, and says so (PROGRAM-QUESTIONS 75)', () => {
    expect(markHereItems(gobletSquat, here(), CARRIED)).toEqual(['flat-bench'])
    expect(lacksDumbbells(gobletSquat, here('flat-bench'))).toBe(true)
    expect(lacksDumbbells(gobletSquat, here('flat-bench', 'dumbbells'))).toBe(false)
    expect(lacksDumbbells(stepOff, here())).toBe(false)
  })
  it('never offers an item carried in the bag: leaving one home is a change to Settings’ kit, not a mark at a gym (PROGRAM-QUESTIONS 75)', () => {
    expect(markHereItems(cableAbduction, here('mini-band'), CARRIED)).toEqual(['cable-station'])
    expect(markHereItems(cableAbduction, here('cable-station'), CARRIED)).toEqual([])
    expect(lacksFromBag(cableAbduction, here('cable-station'), CARRIED)).toEqual(['ankle-strap'])
    expect(lacksFromBag(cableAbduction, here('cable-station', 'ankle-strap'), CARRIED)).toEqual([])
  })
  it('offers nothing for an exercise that runs here', () => {
    expect(markHereItems(splitSquat, here(), CARRIED)).toEqual([])
    expect(markHereItems(legPress, here('seated-leg-press'), CARRIED)).toEqual([])
  })
})

describe('markOffItems: "Smith machine isn’t here: mark it"', () => {
  it('offers what the exercise swapped away from uses that the list says is here and the pick doesn’t use', () => {
    expect(markOffItems(smithBoxSquat, gobletSquat, here('smith-machine', 'flat-bench', 'dumbbells'), CARRIED)).toEqual(['smith-machine'])
    expect(markOffItems(smithBoxSquat, splitSquat, here('smith-machine', 'flat-bench'), CARRIED)).toEqual(['smith-machine', 'flat-bench'])
  })
  it('leaves out what isn’t here already', () => {
    expect(markOffItems(smithBoxSquat, splitSquat, here('flat-bench'), CARRIED)).toEqual(['flat-bench'])
  })
  it('never offers a carried item or dumbbells (PROGRAM-QUESTIONS 75)', () => {
    expect(markOffItems(cableAbduction, bandWalk, here('cable-station', ...CARRIED), CARRIED)).toEqual(['cable-station'])
    expect(markOffItems(gobletSquat, splitSquat, here('dumbbells', 'flat-bench'), CARRIED)).toEqual(['flat-bench'])
  })
  it('reads the stages too, and each option of an either-or', () => {
    expect(markOffItems(balance, singleLegBalance, here('mats', 'bosu'), CARRIED)).toEqual(['bosu'])
    expect(markOffItems(calfRaise, splitSquat, here('stair'), CARRIED)).toEqual(['stair'])
  })
})

describe('swapOffer: what a Swap pick offers (design section 4)', () => {
  it('a pick that isn’t here offers to mark what it lacks here', () => {
    expect(swapOffer(gobletSquat, smithBoxSquat, here('flat-bench', 'dumbbells'), CARRIED)).toEqual({ kind: 'mark-here', items: ['smith-machine'], dumbbells: false, bag: [] })
  })
  it('a pick that isn’t here for want of dumbbells says so, with nothing to mark', () => {
    expect(swapOffer(splitSquat, gobletSquat, here('flat-bench'), CARRIED)).toEqual({ kind: 'mark-here', items: [], dumbbells: true, bag: [] })
  })
  it('a pick that lacks a carried item says the bag lacks it, with nothing to mark at the gym', () => {
    expect(swapOffer(bandWalk, cableAbduction, here('cable-station', 'mini-band'), CARRIED)).toEqual({ kind: 'mark-here', items: [], dumbbells: false, bag: ['ankle-strap'] })
  })
  it('a pick that is here offers to mark off what the exercise it replaced needed', () => {
    expect(swapOffer(smithBoxSquat, gobletSquat, here('smith-machine', 'flat-bench', 'dumbbells'), CARRIED)).toEqual({ kind: 'mark-off', items: ['smith-machine'] })
  })
  it('offers nothing when there is nothing to mark', () => {
    expect(swapOffer(splitSquat, gobletSquat, here('flat-bench', 'dumbbells'), CARRIED)).toBeNull()
    expect(swapOffer(gobletSquat, gobletSquat, here('flat-bench', 'dumbbells'), CARRIED)).toBeNull()
  })
  it('re-picking the exercise on the card that isn’t here offers to mark it here', () => {
    expect(swapOffer(stepOff, stepOff, here(), CARRIED)).toEqual({ kind: 'mark-here', items: ['step-platforms'], dumbbells: false, bag: [] })
  })
})
