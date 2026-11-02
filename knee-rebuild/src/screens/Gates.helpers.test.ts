import { describe, expect, it } from 'vitest'
import { program } from '../program/program.ts'
import { addDays, weekOf } from '../rules/calendar.ts'
import { evaluateGate } from '../rules/gates.ts'
import { attachChecks } from '../rules/history.ts'
import { advancePhase } from '../rules/progress.ts'
import { Settings, type Gate, type GateTest, type IsoDate, type MorningCheck, type Run, type SetLog, type Workout } from '../schema/index.ts'
import {
  CALF_RAISE_EXERCISE_IDS,
  TEST_EXERCISE,
  advanceQuestion,
  advanceState,
  advancedWords,
  bestWords,
  buildTest,
  currentGate,
  detailWords,
  earlierTests,
  errorWords,
  formBest,
  formBlocker,
  gateContext,
  gatesView,
  lineWords,
  loadPrefill,
  manualTest,
  newGateTestId,
  noGateWords,
  openForm,
  orderedTests,
  passCountWords,
  prefillWords,
  setValue,
  sideNames,
  stateWords,
  symmetryLine,
  testErrorSentence,
  withoutKey,
  type HistoryLike,
  type ItemView,
} from './Gates.helpers.ts'

/** The live seed's gates and phases: the done criterion is about the program's own gate 1 and gate 3. */
const PROGRAM = { gates: program.gates, phases: program.phases, exercises: program.exercises, redFlags: program.redFlags }
const START = '2026-11-02'
const TODAY = '2026-11-22' // Sunday of week 3, the last day of Phase 1 on the nominal schedule

function gateNumber(n: number): Gate {
  const gate = program.gates.find((g) => g.number === n)
  if (!gate) throw new Error(`no gate ${n} in the seed`)
  return gate
}
const gate1 = gateNumber(1)
const gate3 = gateNumber(3)

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...Settings.parse({ injuredSide: 'right', startDate: START, dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false }),
  ...over,
})

const workout = (date: IsoDate, over: Partial<Workout> = {}): Workout => ({
  id: `w-${date}`, date, templateId: 'p1-a', phase: 1, week: weekOf(date, START), isDeload: false, status: 'finished', ...over,
})
const set = (workoutId: string, exerciseId: string, side: SetLog['side'], setNumber: number, load: number, over: Partial<SetLog> = {}): SetLog => ({
  id: `${workoutId}:${exerciseId}:${side}:${setNumber}`, workoutId, slotId: 'p1a-1', exerciseId, setNumber, side, load, loadUnit: 'lb', reps: 12, rpe: 7, painDuring: 2, stopped: false, ...over,
})
const check = (date: IsoDate, over: Partial<MorningCheck> = {}): MorningCheck => ({
  id: `mc-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over,
})
const run = (date: IsoDate, type: Run['type'], miles: number): Run => ({ id: `run-${date}`, date, type, miles, minutes: miles * 10, effort: 'easy', maxPain: 1, strides: false, tempo: false })
const daysFrom = (from: IsoDate, to: IsoDate): IsoDate[] => {
  const out: IsoDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * Two Phase 1 weeks as the app logs them: lifts Tuesday, Thursday and Saturday (three sets of the
 * leg press at pain 2), runs Monday, Wednesday and Friday (Friday's long run is 4 miles), and a clean
 * morning check every day. Nothing here is entered on the Gates screen.
 */
function loggedPhase1(): HistoryLike {
  const liftDays = ['2026-11-10', '2026-11-12', '2026-11-14', '2026-11-17', '2026-11-19', '2026-11-21']
  const workouts = liftDays.map((d) => workout(d))
  const setLogs = workouts.flatMap((w) => [1, 2, 3].map((n) => set(w.id, 'leg-press', 'both', n, 140)))
  const runs = [run('2026-11-09', 'mbr', 3), run('2026-11-11', 'easy', 3), run('2026-11-13', 'long', 3.5), run('2026-11-16', 'mbr', 3), run('2026-11-18', 'easy', 3), run('2026-11-20', 'long', 4)]
  const morningChecks = daysFrom('2026-11-10', TODAY).map((d) => check(d))
  return { workouts, setLogs, morningChecks, runs, gateTests: [] }
}

const byId = (view: ReturnType<typeof gatesView>, id: string): ItemView => {
  if (view.kind !== 'gate') throw new Error('expected a gate')
  const item = view.items.find((i) => i.item.id === id)
  if (!item) throw new Error(`no item ${id}`)
  return item
}

describe('done criterion: gate 1 evaluates from logged data alone', () => {
  it('reads the clean weeks and the 4-mile run from workouts, set logs, morning checks and runs; the test and the toggle wait for entry', () => {
    const history = loggedPhase1()
    const result = evaluateGate(gate1, gateContext({ today: TODAY, settings: settings(), history }))
    expect(result.items.map((i) => [i.item.id, i.pass])).toEqual([
      ['g1-clean-weeks', true],
      ['g1-sl-leg-press', false],
      ['g1-stance', false],
      ['g1-run', true],
    ])
    expect(result.passes).toBe(false)

    const view = gatesView({ today: TODAY, settings: settings(), history, program: PROGRAM })
    if (view.kind !== 'gate') throw new Error('expected gate 1')
    expect(view.gate.number).toBe(1)
    expect(view.countLine).toBe('2 of 4 items pass')
    expect(byId(view, 'g1-clean-weeks')).toMatchObject({ kind: 'auto', mark: '✓', word: 'Passes', detail: '12 readings in the last 14 days, all clean.' })
    expect(byId(view, 'g1-run')).toMatchObject({ kind: 'auto', mark: '✓', word: 'Passes', detail: '4 miles on Friday Nov 20 with a clean morning after.' })
    expect(byId(view, 'g1-sl-leg-press')).toMatchObject({ kind: 'symmetry', mark: '○', word: 'Not yet', detail: 'No test entered yet.' })
    expect(byId(view, 'g1-stance')).toMatchObject({ kind: 'manual', mark: '○', word: 'Not yet', detail: 'Not ticked.' })
    expect(view.advance).toEqual({ enabled: false, why: '2 items don’t pass yet' })
  })

  it('one hold in the window fails the clean weeks, from the logged pain alone', () => {
    const history = loggedPhase1()
    const sore = { ...history, setLogs: history.setLogs.map((s) => (s.workoutId === 'w-2026-11-17' ? { ...s, painDuring: 4 } : s)) }
    const view = gatesView({ today: TODAY, settings: settings(), history: sore, program: PROGRAM })
    expect(byId(view, 'g1-clean-weeks')).toMatchObject({ pass: false, word: 'Not yet', detail: '1 of 12 readings in the last 14 days read hold.' })
  })

  it('with the leg-press test prefilled from logged sets and the stance ticked, the gate passes and advances only on confirmation', () => {
    const logged = loggedPhase1()
    // A single-leg leg press session that logged both sides: right (injured) 80 lb, left 100 lb.
    const sl = workout('2026-11-19', { id: 'w-sl' })
    const slSets = [set('w-sl', 'single-leg-leg-press', 'right', 1, 75, { reps: 10 }), set('w-sl', 'single-leg-leg-press', 'right', 2, 80, { reps: 10 }), set('w-sl', 'single-leg-leg-press', 'left', 1, 100, { reps: 10 })]
    const history: HistoryLike = { ...logged, workouts: [...logged.workouts, sl], setLogs: [...logged.setLogs, ...slSets] }

    const view = gatesView({ today: TODAY, settings: settings(), history, program: PROGRAM })
    const legPress = byId(view, 'g1-sl-leg-press')
    if (legPress.kind !== 'symmetry') throw new Error('expected a symmetry item')
    expect(legPress.entry).toMatchObject({ key: 'sl-leg-press-10rm', threshold: 0.8, trials: null, unit: 'lb', step: 5, prefill: { date: '2026-11-19', injured: 80, other: 100 } })
    expect(legPress.entry.prefillLine).toBe('Prefilled from Thursday Nov 19’s session: Single-leg leg press, 80 lb right and 100 lb left, the heaviest set on each side. Change either to what the test lifted.')

    const form = openForm(legPress.entry.trials, legPress.entry.prefill)
    expect(symmetryLine(formBest(form), legPress.entry.threshold)).toBe('80% · the line is 80%: passes')
    const draft = buildTest({ gate: gate1, item: legPress.item, form, today: TODAY, id: newGateTestId('2026-11-22T15:00:00.000Z', 'sl-leg-press-10rm', []) })
    if (!draft.ok) throw new Error(draft.blocker)
    expect(draft.test).toEqual({ id: 'gate-test-2026-11-22T15:00:00.000Z-sl-leg-press-10rm', date: TODAY, gate: 1, item: 'sl-leg-press-10rm', valueInjured: 80, valueOther: 100, pass: true, manual: false })

    const stance = byId(view, 'g1-stance')
    const tick = manualTest({ gate: gate1, item: stance.item, pass: true, today: TODAY, id: newGateTestId('2026-11-22T15:01:00.000Z', stance.item.id, []) })
    const passing = gatesView({ today: TODAY, settings: settings(), history: { ...history, gateTests: [draft.test, tick] }, program: PROGRAM })
    if (passing.kind !== 'gate') throw new Error('expected gate 1')
    expect(passing.countLine).toBe('4 of 4 items pass')
    expect(passing.result.passes).toBe(true)
    expect(passing.advance).toEqual({ enabled: true })
    expect(passing.question).toBe('Advance to Phase 2: Single-leg strength and balance? From the next session the templates change and week bands count from this week.')

    // Nothing has moved yet: the phase changes only when the confirmed advance is saved.
    const next = advancePhase(settings(), passing.gate, passing.result.passes, weekOf(TODAY, START))
    expect(next).toMatchObject({ currentPhase: 2, phaseEnteredWeek: 3 })
    expect(advancedWords(next, program.phases)).toBe('Phase 2: Single-leg strength and balance, entered in week 3.')
  })

  it('says so when no session has logged both sides of the test exercise', () => {
    const view = gatesView({ today: TODAY, settings: settings(), history: loggedPhase1(), program: PROGRAM })
    const legPress = byId(view, 'g1-sl-leg-press')
    if (legPress.kind !== 'symmetry') throw new Error('expected a symmetry item')
    expect(legPress.entry.prefill).toBeNull()
    expect(openForm(legPress.entry.trials, legPress.entry.prefill)).toEqual({ injured: [null], other: [null] })
    expect(legPress.entry.prefillLine).toBe('Nothing to prefill: no session has logged both sides of this exercise (Single-leg leg press) yet. Enter the loads from the test.')
  })
})

describe('done criterion: the hop-test worked example', () => {
  it('best 56 injured against 62 other reads 90.3% and passes gate 3’s 90% line', () => {
    const phase3 = settings({ currentPhase: 3, phaseEnteredWeek: 8 })
    const view = gatesView({ today: TODAY, settings: phase3, history: { ...loggedPhase1(), gateTests: [] }, program: PROGRAM })
    if (view.kind !== 'gate') throw new Error('expected gate 3')
    expect(view.gate.number).toBe(3)
    const hop = byId(view, 'g3-single-hop')
    if (hop.kind !== 'symmetry') throw new Error('expected a symmetry item')
    expect(hop.entry).toMatchObject({ key: 'single-hop', threshold: 0.9, trials: 3, unit: 'in', prefill: null, prefillLine: null })
    expect(hop.entry.sides).toEqual({ injured: 'Right · injured', other: 'Left' })

    let form = openForm(hop.entry.trials, hop.entry.prefill)
    // Every trial starts not entered: a 0 would be a hop he couldn't do.
    expect(form).toEqual({ injured: [null, null, null], other: [null, null, null] })
    expect(symmetryLine(formBest(form), hop.entry.threshold)).toBe('Enter both sides to see the symmetry.')
    ;[50, 56, 54].forEach((v, i) => (form = setValue(form, 'injured', i, v)))
    ;[60, 62, 61].forEach((v, i) => (form = setValue(form, 'other', i, v)))
    const best = formBest(form)
    expect(best).toEqual({ injured: 56, other: 62 })
    expect(bestWords(best.injured, 'in')).toBe('Best 56 in')
    expect(symmetryLine(best, hop.entry.threshold)).toBe('90.3% · the line is 90%: passes')

    const draft = buildTest({ gate: gate3, item: hop.item, form, today: TODAY, id: 'gate-test-2026-11-22T16:00:00.000Z-single-hop' })
    if (!draft.ok) throw new Error(draft.blocker)
    expect(draft.test).toEqual({
      id: 'gate-test-2026-11-22T16:00:00.000Z-single-hop', date: TODAY, gate: 3, item: 'single-hop',
      valueInjured: 56, valueOther: 62, trialsInjured: [50, 56, 54], trialsOther: [60, 62, 61], pass: true, manual: false,
    })

    const after = gatesView({ today: TODAY, settings: phase3, history: { ...loggedPhase1(), gateTests: [draft.test] }, program: PROGRAM })
    const evaluated = byId(after, 'g3-single-hop')
    expect(evaluated).toMatchObject({ pass: true, mark: '✓', word: 'Passes', detail: '90.3% (56 vs 62) against a 90% line, tested Sunday Nov 22.' })
    if (evaluated.kind !== 'symmetry') throw new Error('expected a symmetry item')
    expect(evaluated.entry.earlier).toEqual([{ id: draft.test.id, when: 'Sunday Nov 22', percent: '90.3%', values: '56 vs 62 in', pass: true, word: '✓ passes' }])
  })

  it('just under the line reads not yet, and the saved test fails the item', () => {
    const form = { injured: [55, 55.5, 50], other: [60, 62, 61] }
    expect(symmetryLine(formBest(form), 0.9)).toBe('89.5% · the line is 90%: not yet')
    const hop = gate3.items[0]
    if (!hop) throw new Error('no hop item')
    const draft = buildTest({ gate: gate3, item: hop, form, today: TODAY, id: 't' })
    expect(draft.ok && draft.test.pass).toBe(false)
  })
})

describe('symmetry forms: hop tests (PROGRAM-QUESTIONS 86, Shawn Nov 2)', () => {
  const hop = gate3.items[0]
  if (!hop) throw new Error('no hop item')
  const phase3 = settings({ currentPhase: 3, phaseEnteredWeek: 8 })

  it('saves once one trial on each side is entered; trials not entered are left out of the test', () => {
    const none = openForm(3, null)
    expect(formBlocker(none, 3)).toBe('Enter at least one trial on each side to save')
    const injuredOnly = setValue(none, 'injured', 0, 56)
    expect(formBlocker(injuredOnly, 3)).toBe('Enter at least one trial on each side to save')
    expect(symmetryLine(formBest(injuredOnly), 0.9)).toBe('Enter the other side to see the symmetry.')
    expect(symmetryLine(formBest(setValue(none, 'other', 2, 62)), 0.9)).toBe('Enter the injured side to see the symmetry.')

    const form = setValue(injuredOnly, 'other', 1, 62)
    expect(form).toEqual({ injured: [56, null, null], other: [null, 62, null] })
    expect(formBlocker(form, 3)).toBeNull()
    expect(formBest(form)).toEqual({ injured: 56, other: 62 })
    expect(symmetryLine(formBest(form), 0.9)).toBe('90.3% · the line is 90%: passes')
    expect(buildTest({ gate: gate3, item: hop, form, today: TODAY, id: 't' })).toEqual({
      ok: true,
      test: { id: 't', date: TODAY, gate: 3, item: 'single-hop', valueInjured: 56, valueOther: 62, trialsInjured: [56], trialsOther: [62], pass: true, manual: false },
    })
  })

  it('0 is a trial (he couldn’t hop), distinct from not entered: 0 on the injured side reads 0% and fails', () => {
    let form = setValue(openForm(3, null), 'injured', 0, 0)
    expect(form.injured).toEqual([0, null, null])
    expect(formBest(form).injured).toBe(0)
    expect(bestWords(0, 'in')).toBe('Best 0 in')
    expect(bestWords(null, 'in')).toBe('Best: nothing entered yet')
    // Clearing a trial takes it back to not entered.
    expect(setValue(form, 'injured', 0, null).injured).toEqual([null, null, null])

    form = setValue(setValue(form, 'other', 0, 62), 'other', 1, 60)
    expect(symmetryLine(formBest(form), 0.9)).toBe('0% · the line is 90%: not yet')
    expect(formBlocker(form, 3)).toBeNull()
    const draft = buildTest({ gate: gate3, item: hop, form, today: TODAY, id: 'gate-test-2026-11-22T16:00:00.000Z-single-hop' })
    if (!draft.ok) throw new Error(draft.blocker)
    expect(draft.test).toMatchObject({ valueInjured: 0, valueOther: 62, trialsInjured: [0], trialsOther: [62, 60], pass: false, manual: false })

    const after = gatesView({ today: TODAY, settings: phase3, history: { ...loggedPhase1(), gateTests: [draft.test] }, program: PROGRAM })
    const evaluated = byId(after, 'g3-single-hop')
    expect(evaluated).toMatchObject({ pass: false, mark: '○', word: 'Not yet', detail: '0% (0 vs 62) against a 90% line, tested Sunday Nov 22.' })
    if (evaluated.kind !== 'symmetry') throw new Error('expected a symmetry item')
    expect(evaluated.entry.earlier[0]).toMatchObject({ percent: '0%', values: '0 vs 62 in', pass: false, word: '○ not yet' })
  })

  it('0 on both sides cannot be a percent: the line says so and Save waits', () => {
    const form = { injured: [0, null, null], other: [0, 0, null] }
    expect(symmetryLine(formBest(form), 0.9)).toBe('Both sides are 0, so there is no percent.')
    expect(formBlocker(form, 3)).toBe('Both sides are 0, so there is no percent to save')
    expect(buildTest({ gate: gate3, item: hop, form, today: TODAY, id: 't' })).toEqual({ ok: false, blocker: 'Both sides are 0, so there is no percent to save' })
    // The other side alone at 0 can't be a percent either.
    const otherZero = { injured: [20, null, null], other: [0, null, null] }
    expect(symmetryLine(formBest(otherZero), 0.9)).toBe('The other side is 0, so there is no percent.')
    expect(formBlocker(otherZero, 3)).toBe('The other side is 0, so there is no percent to save')
  })
})

describe('symmetry forms: load tests', () => {
  it('a load test needs both sides; the line says what is missing', () => {
    expect(formBlocker({ injured: [80], other: [null] }, null)).toBe('Enter both sides to save')
    expect(formBlocker({ injured: [80], other: [0] }, null)).toBe('Enter both sides to save')
    expect(formBlocker({ injured: [80], other: [100] }, null)).toBeNull()
    expect(symmetryLine({ injured: 80, other: null }, 0.8)).toBe('Enter the other side to see the symmetry.')
    expect(symmetryLine({ injured: null, other: null }, 0.8)).toBe('Enter both sides to see the symmetry.')
    expect(symmetryLine({ injured: 70, other: 100 }, 0.8)).toBe('70% · the line is 80%: not yet')
    expect(openForm(null, { date: '2026-12-01', injured: 80, other: 100 })).toEqual({ injured: [80], other: [100] })
  })

  it('an item without a test key cannot save', () => {
    const item = { id: 'x', text: 'x', evaluator: 'symmetry' as const, threshold: 0.9 }
    expect(buildTest({ gate: gate3, item, form: { injured: [1], other: [1] }, today: TODAY, id: 't' })).toEqual({ ok: false, blocker: 'This item has no test key in the program data' })
  })

  it('setValue changes one value and leaves the form it came from alone', () => {
    const form = openForm(3, null)
    const next = setValue(form, 'other', 1, 62)
    expect(next).toEqual({ injured: [null, null, null], other: [null, 62, null] })
    expect(form.other).toEqual([null, null, null])
  })
})

describe('loadPrefill', () => {
  const records = (workouts: Workout[], sets: SetLog[]) => attachChecks(workouts, sets, [])
  it('takes the latest session that logged both sides, each side’s heaviest set', () => {
    const w1 = workout('2026-12-01', { id: 'w1' })
    const w2 = workout('2026-12-08', { id: 'w2' })
    const sets = [
      set('w1', 'single-leg-leg-press', 'right', 1, 90), set('w1', 'single-leg-leg-press', 'left', 1, 100),
      set('w2', 'single-leg-leg-press', 'right', 1, 95), set('w2', 'single-leg-leg-press', 'right', 2, 100), set('w2', 'single-leg-leg-press', 'left', 1, 105),
    ]
    expect(loadPrefill(records([w1, w2], sets), 'single-leg-leg-press', 'right')).toEqual({ date: '2026-12-08', injured: 100, other: 105 })
    expect(loadPrefill(records([w1, w2], sets), 'single-leg-leg-press', 'left')).toEqual({ date: '2026-12-08', injured: 105, other: 100 })
  })

  it('passes over a session missing a side and one still in progress; abandoned sessions count', () => {
    const w1 = workout('2026-12-01', { id: 'w1', status: 'abandoned' })
    const w2 = workout('2026-12-08', { id: 'w2' })
    const w3 = workout('2026-12-10', { id: 'w3', status: 'in-progress' })
    const sets = [
      set('w1', 'bulgarian-split-squat', 'right', 1, 25), set('w1', 'bulgarian-split-squat', 'left', 1, 30),
      set('w2', 'bulgarian-split-squat', 'right', 1, 30, { stopped: true, stopReason: 'sharp-joint-line-pain' }),
      set('w3', 'bulgarian-split-squat', 'right', 1, 35), set('w3', 'bulgarian-split-squat', 'left', 1, 35),
    ]
    expect(loadPrefill(records([w1, w2, w3], sets), 'bulgarian-split-squat', 'right')).toEqual({ date: '2026-12-01', injured: 25, other: 30 })
    expect(loadPrefill(records([w2], sets), 'bulgarian-split-squat', 'right')).toBeNull()
  })

  it('says where the numbers came from', () => {
    const exercise = { name: 'Bulgarian split squat', loadUnit: 'lb' as const }
    expect(prefillWords(exercise, { date: '2026-12-01', injured: 25, other: 30 }, 'left')).toBe(
      'Prefilled from Tuesday Dec 1’s session: Bulgarian split squat, 25 lb left and 30 lb right, the heaviest set on each side. Change either to what the test lifted.',
    )
    expect(prefillWords(null, null, 'right')).toBe('Nothing to prefill from: enter the values from the test.')
  })
})

describe('manual items and test order', () => {
  it('a toggle writes a manual test with the item’s own id and zero values', () => {
    expect(manualTest({ gate: gate1, item: { id: 'g1-stance' }, pass: false, today: TODAY, id: 'gate-test-x' })).toEqual({ id: 'gate-test-x', date: TODAY, gate: 1, item: 'g1-stance', valueInjured: 0, valueOther: 0, pass: false, manual: true })
  })

  it('the latest test wins: an untick after a tick the same day reads not ticked, whatever order storage returns', () => {
    const tick = manualTest({ gate: gate1, item: { id: 'g1-stance' }, pass: true, today: TODAY, id: newGateTestId('2026-11-22T14:00:00.000Z', 'g1-stance', []) })
    const untick = manualTest({ gate: gate1, item: { id: 'g1-stance' }, pass: false, today: TODAY, id: newGateTestId('2026-11-22T14:05:00.000Z', 'g1-stance', []) })
    for (const gateTests of [[tick, untick], [untick, tick]]) {
      const view = gatesView({ today: TODAY, settings: settings(), history: { ...loggedPhase1(), gateTests }, program: PROGRAM })
      expect(byId(view, 'g1-stance')).toMatchObject({ pass: false, word: 'Not yet', detail: 'Unticked Sunday Nov 22.' })
    }
    const older = { ...tick, date: '2026-11-20', id: newGateTestId('2026-11-20T14:00:00.000Z', 'g1-stance', []) }
    expect(orderedTests([tick, older]).map((t) => t.date)).toEqual(['2026-11-20', TODAY])
  })

  it('ids lead with the stamp and never collide', () => {
    expect(newGateTestId('2026-11-22T14:00:00.000Z', 'single-hop', [])).toBe('gate-test-2026-11-22T14:00:00.000Z-single-hop')
    expect(newGateTestId('S', 'k', ['gate-test-S-k', 'gate-test-S-k-2'])).toBe('gate-test-S-k-3')
  })

  it('earlier tests list newest first, by date then write order, with the percent each read', () => {
    const t = (id: string, date: IsoDate, valueInjured: number, extra: Partial<GateTest> = {}): GateTest => ({ id, date, gate: 2, item: 'bulgarian-load', valueInjured, valueOther: 40, pass: false, manual: false, ...extra })
    const tests = [t('gate-test-b', '2026-12-08', 36), t('gate-test-a', '2026-12-08', 30), t('gate-test-c', '2026-12-01', 35), t('gate-test-d', '2026-12-09', 40, { gate: 3 }), t('gate-test-e', '2026-12-09', 40, { item: 'other' })]
    expect(earlierTests(tests, 2, 'bulgarian-load', 0.9, 'lb').map((e) => [e.when, e.percent, e.values, e.word])).toEqual([
      ['Tuesday Dec 8', '90%', '36 vs 40 lb', '✓ passes'],
      ['Tuesday Dec 8', '75%', '30 vs 40 lb', '○ not yet'],
      ['Tuesday Dec 1', '87.5%', '35 vs 40 lb', '○ not yet'],
    ])
    expect(earlierTests([t('z', '2026-12-01', 30, { valueOther: 0 })], 2, 'bulgarian-load', 0.9, 'lb')[0]?.percent).toBe('no percent (the other side was 0)')
  })
})

describe('advancing the phase', () => {
  const items = (passes: boolean[]) => ({ items: passes.map((pass) => ({ pass })), passes: passes.every(Boolean) })
  it('is enabled only when every item passes, and says why otherwise', () => {
    expect(advanceState(items([true, true]), { active: false, items: [] })).toEqual({ enabled: true })
    expect(advanceState(items([true, false]), { active: false, items: [] })).toEqual({ enabled: false, why: '1 item doesn’t pass yet' })
    expect(advanceState(items([false, false, true]), { active: false, items: [] })).toEqual({ enabled: false, why: '2 items don’t pass yet' })
  })

  it('waits while the red-flag state suspends progression (rule 9)', () => {
    expect(advanceState(items([true]), { active: true, since: TODAY, items: ['locking'] })).toEqual({ enabled: false, why: 'The red-flag state is on: clear it in Settings, with a note, before advancing' })
    const flag = program.redFlags[0]
    if (!flag) throw new Error('no red flags in the seed')
    const view = gatesView({ today: TODAY, settings: settings({ redFlag: { active: true, since: TODAY, items: [flag.id] } }), history: loggedPhase1(), program: PROGRAM })
    if (view.kind !== 'gate') throw new Error('expected gate 1')
    expect(view.stop).toEqual({ headline: 'Stop. Call the ortho or PT.', items: [flag.text] })
    expect(gatesView({ today: TODAY, settings: settings(), history: loggedPhase1(), program: PROGRAM })).toMatchObject({ kind: 'gate', stop: null })
  })

  it('asks a Phase 4 question that doesn’t promise templates', () => {
    expect(advanceQuestion(gate3, program.phases)).toBe('Advance to Phase 4: Lacrosse? Its sessions arrive with the next program update; until then Today says they are not written yet.')
  })

  it('Phase 4 has no gate to check', () => {
    expect(currentGate(program.gates, 4)).toBeNull()
    expect(currentGate(program.gates, 2)?.number).toBe(2)
    expect(gatesView({ today: TODAY, settings: settings({ currentPhase: 4 }), history: loggedPhase1(), program: PROGRAM })).toEqual({
      kind: 'no-gate',
      line: 'Gate 3 passed; Phase 4’s sessions arrive with the next program update.',
    })
    expect(noGateWords([], 2)).toBe('No gate leads out of Phase 2 in the program data.')
  })
})

describe('words', () => {
  it('counts and states', () => {
    expect(passCountWords({ items: [{ pass: true }, { pass: false }, { pass: true }, { pass: true }] })).toBe('3 of 4 items pass')
    expect(passCountWords({ items: [{ pass: true }, { pass: false }] })).toBe('1 of 2 items passes')
    expect(stateWords(true)).toEqual({ mark: '✓', word: 'Passes' })
    expect(stateWords(false)).toEqual({ mark: '○', word: 'Not yet' })
    expect(lineWords(0.9)).toBe('90%')
    expect(lineWords(0.8)).toBe('80%')
    expect(sideNames('left')).toEqual({ injured: 'Left · injured', other: 'Right' })
  })

  it('details read as sentences with dates in words', () => {
    expect(detailWords('ticked 2026-11-20')).toBe('Ticked Friday Nov 20.')
    expect(detailWords('swelling flagged on 2026-11-19, 2026-11-20')).toBe('Swelling flagged on Thursday Nov 19, Friday Nov 20.')
    expect(detailWords('80% (80 vs 100) against a 80% line, tested 2026-11-22')).toBe('80% (80 vs 100) against an 80% line, tested Sunday Nov 22.')
    expect(detailWords('90% (9 vs 10) against a 90% line')).toBe('90% (9 vs 10) against a 90% line.')
    expect(detailWords('Done.')).toBe('Done.')
    expect(detailWords('')).toBe('')
  })

  it('rejected writes in one sentence', () => {
    expect(testErrorSentence(new Error('QuotaExceededError'))).toBe('The test did not save (QuotaExceededError). Nothing was written; tap Save again.')
    expect(errorWords('  ')).toBe('no reason was given')
    expect(withoutKey({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 })
  })
})

describe('the seed’s gates fit the screen', () => {
  it('every symmetry item has a line and a test key; load tests name a two-sided exercise to prefill from', () => {
    const symmetry = program.gates.flatMap((g) => g.items.filter((i) => i.evaluator === 'symmetry'))
    expect(symmetry.length).toBeGreaterThan(0)
    for (const item of symmetry) {
      expect(item.threshold, item.id).toBeDefined()
      expect(item.testItem, item.id).toBeDefined()
      if (item.trials !== undefined) continue
      const exerciseId = item.testItem ? TEST_EXERCISE[item.testItem] : undefined
      const exercise = program.exercises.find((e) => e.id === exerciseId)
      expect(exercise?.unilateral, item.id).toBe(true)
    }
    expect(CALF_RAISE_EXERCISE_IDS.every((id) => program.exercises.some((e) => e.id === id))).toBe(true)
  })
})
