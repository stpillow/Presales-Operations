import { describe, expect, it } from 'vitest'
import type { SlotRoute } from './equipment.ts'
import { gymChanges, type PlannedSlot } from './gymChanges.ts'

// Inline plans shaped like planSession's at a hotel (design sections 4 and 5); the ids are the seed's own.

const own = (exerciseId: string): SlotRoute => ({ kind: 'own', exerciseId, passedOver: [] })
const plan = (slotId: string, exerciseId: string, route: SlotRoute, prescriptions: PlannedSlot['prescriptions'] = [{ exerciseId }]): PlannedSlot => ({ slotId, exerciseId, route, prescriptions })

describe('what a gym changes in a planned session (Today’s list, from the plan the runner runs)', () => {
  it('a slot the gym routes moved: from the exercise passed over, to the gym’s pick, with what the gym lacks', () => {
    const route: SlotRoute = {
      kind: 'moved',
      exerciseId: 'goblet-squat-bench',
      passedOver: [
        { exerciseId: 'leg-press', missing: ['seated-leg-press'] },
        { exerciseId: 'leg-press-45', missing: ['leg-press-45'] },
      ],
    }
    expect(gymChanges([plan('p1a-1', 'goblet-squat-bench', route)])).toEqual([
      { slotId: 'p1a-1', kind: 'moved', from: 'leg-press', to: 'goblet-squat-bench', missing: ['seated-leg-press'], pastRack: false, rackCapped: false },
    ])
  })

  it('a slot with nothing here is listed, from where its history put it (PROGRAM-QUESTIONS 86)', () => {
    const route: SlotRoute = { kind: 'none', exerciseId: 'single-leg-seated-leg-curl', passedOver: [{ exerciseId: 'single-leg-seated-leg-curl', missing: ['seated-leg-curl'] }] }
    // The slot's own exercise (the Nordics) runs here; the history put the slot on the curl, and that doesn't.
    expect(gymChanges([plan('p3a-2', 'single-leg-seated-leg-curl', route)])).toEqual([
      { slotId: 'p3a-2', kind: 'none', from: 'single-leg-seated-leg-curl', to: 'single-leg-seated-leg-curl', missing: ['seated-leg-curl'], pastRack: false, rackCapped: false },
    ])
  })

  it('the rack moves a slot that runs here: from the planned exercise to where the rack put it, past the rack', () => {
    const moved = plan('p1c-2', 'db-rdl', own('db-rdl'), [{ exerciseId: 'single-leg-rdl', rackMoved: true }])
    expect(gymChanges([moved])).toEqual([{ slotId: 'p1c-2', kind: 'moved', from: 'db-rdl', to: 'single-leg-rdl', missing: [], pastRack: true, rackCapped: false }])
  })

  it('the gym’s move, then the rack’s: to where the rack put it, with what the gym lacks for the first', () => {
    const route: SlotRoute = { kind: 'moved', exerciseId: 'step-up-stair', passedOver: [{ exerciseId: 'step-up', missing: ['step-platforms'] }] }
    const both = plan('p1c-1', 'step-up-stair', route, [{ exerciseId: 'split-squat', rackMoved: true }])
    expect(gymChanges([both])).toEqual([{ slotId: 'p1c-1', kind: 'moved', from: 'step-up', to: 'split-squat', missing: ['step-platforms'], pastRack: true, rackCapped: false }])
  })

  it('a rack-capped slot is listed as capped; a capped move says both', () => {
    const capped = plan('p1c-4', 'incline-db-press', own('incline-db-press'), [{ exerciseId: 'incline-db-press', rackCapped: true }])
    expect(gymChanges([capped])).toEqual([{ slotId: 'p1c-4', kind: 'capped', from: 'incline-db-press', to: 'incline-db-press', missing: [], pastRack: false, rackCapped: true }])
    const route: SlotRoute = { kind: 'moved', exerciseId: 'db-bench-press', passedOver: [{ exerciseId: 'chest-press-machine', missing: ['chest-press-machine'] }] }
    const movedCapped = plan('p1b-3', 'db-bench-press', route, [{ exerciseId: 'db-bench-press', rackCapped: true }])
    expect(gymChanges([movedCapped])[0]).toMatchObject({ kind: 'moved', to: 'db-bench-press', pastRack: false, rackCapped: true })
  })

  it('a slot that runs where its history put it, uncapped, is not listed; nor is the engine’s own back-off move', () => {
    expect(gymChanges([plan('p1a-1', 'leg-press', own('leg-press'))])).toEqual([])
    // Nordics backed off at any gym: the card runs the easier version, but the gym changed nothing.
    expect(gymChanges([plan('p3a-2', 'nordic-negatives', own('nordic-negatives'), [{ exerciseId: 'single-leg-seated-leg-curl' }])])).toEqual([])
  })

  it('a moved slot whose card the engine moved on again (a back-off) still names the gym’s pick, as the runner’s gym line does', () => {
    const route: SlotRoute = { kind: 'moved', exerciseId: 'lying-leg-curl', passedOver: [{ exerciseId: 'seated-leg-curl', missing: ['seated-leg-curl'] }] }
    expect(gymChanges([plan('p1a-2', 'lying-leg-curl', route, [{ exerciseId: 'stability-ball-leg-curl' }])])[0]).toMatchObject({ to: 'lying-leg-curl', pastRack: false })
  })
})
