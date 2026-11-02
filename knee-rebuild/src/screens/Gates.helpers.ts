import type { History } from '../db/repo.ts'
import { evaluateGate, type GateContext, type GateItemResult, type GateResult } from '../rules/gates.ts'
import { attachChecks, subjectReadings, type WorkoutRecord } from '../rules/history.ts'
import { loadSeries } from '../rules/progress.ts'
import { progressionSuspended, stopMessage, type RedFlagState } from '../rules/redFlags.ts'
import { bestOfTrials, meetsSymmetry, symmetryPercent } from '../rules/unilateral.ts'
import type { Exercise, Gate, GateItem, GateTest, IsoDate, Phase, Program, Settings, Side } from '../schema/index.ts'
import { shortDateWords } from './Today.helpers.ts'

/**
 * Pure helpers for the Gates screen: the context the gate rule reads, assembled from what is
 * logged; the words for each item's state and detail; the symmetry entry forms (best of the trials,
 * the live percent against the gate's line, the prefill from logged sets); the tests the screen
 * writes; and whether the phase may advance. Every verdict comes from src/rules (evaluateGate,
 * meetsSymmetry, symmetryPercent, bestOfTrials, progressionSuspended, loadSeries); this file only
 * composes the answers and names them. The program pieces are passed in, so tests use fixtures.
 */

export type HistoryLike = Pick<History, 'workouts' | 'setLogs' | 'morningChecks' | 'runs' | 'gateTests'>
export type ProgramLike = Pick<Program, 'gates' | 'phases' | 'exercises' | 'redFlags'>

/** Which catalog exercises count as the single-leg calf raise for gate 2 (the M5 brief). */
export const CALF_RAISE_EXERCISE_IDS: readonly string[] = ['single-leg-calf-raise-step']

/** The line a symmetry item reads against, as evaluateGate reads it (every seeded item states its own). */
export function lineOf(item: Pick<GateItem, 'threshold'>): number {
  return item.threshold ?? 0.9
}

/** "90%": a gate line in words. */
export function lineWords(threshold: number): string {
  return `${Math.round(threshold * 1000) / 10}%`
}

const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left')
const SIDE_WORD: Record<Side, string> = { left: 'Left', right: 'Right' }

/** The two sides as the forms name them: "Right · injured" and "Left". */
export function sideNames(injuredSide: Side): { injured: string; other: string } {
  return { injured: `${SIDE_WORD[injuredSide]} · injured`, other: SIDE_WORD[otherSide(injuredSide)] }
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Gate tests in the order they were written: by date, then by id. Ids lead with the write's ISO
 * stamp, so a tick and an untick on the same day keep their order and the rule's "latest test"
 * is the last one written, whatever order storage hands them back in.
 */
export function orderedTests(tests: readonly GateTest[]): GateTest[] {
  return [...tests].sort((a, b) => a.date.localeCompare(b.date) || byId(a.id, b.id))
}

/** A new test's id: the write's ISO stamp and the item key, with a suffix if that is somehow taken. */
export function newGateTestId(stamp: string, key: string, taken: readonly string[]): string {
  const base = `gate-test-${stamp}-${key}`
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/** Everything evaluateGate reads, from what is logged: no field here is typed in on the Gates screen except the tests. */
export function gateContext(input: { today: IsoDate; settings: Pick<Settings, 'injuredSide'>; history: HistoryLike; records?: readonly WorkoutRecord[] }): GateContext {
  const { today, settings, history } = input
  const records = input.records ?? attachChecks(history.workouts, history.setLogs, history.morningChecks)
  return {
    today,
    injuredSide: settings.injuredSide,
    readings: subjectReadings(records, history.runs, history.morningChecks, settings.injuredSide),
    gateTests: orderedTests(history.gateTests),
    morningChecks: history.morningChecks,
    runs: history.runs,
    workouts: history.workouts,
    setLogs: history.setLogs,
    calfRaiseExerciseIds: CALF_RAISE_EXERCISE_IDS,
  }
}

/** The gate out of the current phase: the one whose fromPhase is it. None in Phase 4. */
export function currentGate(gates: readonly Gate[], currentPhase: number): Gate | null {
  return gates.find((g) => g.fromPhase === currentPhase) ?? null
}

/** "3 of 4 items pass". */
export function passCountWords(result: { items: readonly { pass: boolean }[] }): string {
  const total = result.items.length
  const n = result.items.filter((i) => i.pass).length
  return `${n} of ${total} ${total === 1 ? 'item' : 'items'} ${n === 1 ? 'passes' : 'pass'}`
}

/** An item's state as a mark and a word, so it reads without color. */
export function stateWords(pass: boolean): { mark: string; word: string } {
  return pass ? { mark: '✓', word: 'Passes' } : { mark: '○', word: 'Not yet' }
}

function dateInWords(date: string): string {
  try {
    return shortDateWords(date)
  } catch {
    return date
  }
}

/** The rule's detail as a sentence: dates in words, "an 80% line", a capital, a full stop. */
export function detailWords(detail: string): string {
  const dated = detail
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, dateInWords)
    .replace(/\ba (8\d(?:\.\d+)?%)/g, 'an $1')
    .trim()
  if (dated.length === 0) return ''
  const sentence = dated.charAt(0).toUpperCase() + dated.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

// ---------------------------------------------------------------------------------------------
// Symmetry entry
// ---------------------------------------------------------------------------------------------

/** The loads of the latest session that logged both sides of an exercise: each side's heaviest set (loadSeries). */
export interface LoadPrefill {
  date: IsoDate
  injured: number
  other: number
}

/**
 * The latest session, finished or abandoned, that logged both sides of the exercise, with each
 * side's best set as loadSeries picks it (the heaviest load). A session missing either side is
 * passed over, so a stop on the injured side never prefills half a test.
 */
export function loadPrefill(records: readonly WorkoutRecord[], exerciseId: string, injuredSide: Side): LoadPrefill | null {
  const other = otherSide(injuredSide)
  for (const record of [...records].reverse()) {
    const points = loadSeries([record], exerciseId)
    const a = points.find((p) => p.side === injuredSide)
    const b = points.find((p) => p.side === other)
    if (a && b) return { date: record.workout.date, injured: a.load, other: b.load }
  }
  return null
}

/**
 * One value in a form: a trial or a load, or null when it isn't entered. A hop trial of 0 is a
 * trial (he couldn't hop), not a blank (PROGRAM-QUESTIONS 86); the Stepper can only show numbers,
 * so not entered lives here.
 */
export type Trial = number | null

/** One side's values: the trials of a hop test, or the one value of a load test. */
export interface SymmetryForm {
  injured: Trial[]
  other: Trial[]
}

/** Each side's best so far; null when nothing is entered on that side. */
export interface FormBest {
  injured: number | null
  other: number | null
}

/** A fresh form: every trial not entered for a hop test, else the prefill's loads (not entered with nothing to prefill from). */
export function openForm(trials: number | null, prefill: LoadPrefill | null): SymmetryForm {
  if (trials !== null) return { injured: Array.from({ length: trials }, () => null), other: Array.from({ length: trials }, () => null) }
  return { injured: [prefill?.injured ?? null], other: [prefill?.other ?? null] }
}

/** The form with one value changed; null takes it back to not entered. */
export function setValue(form: SymmetryForm, side: 'injured' | 'other', index: number, value: Trial): SymmetryForm {
  const values = form[side].map((v, i) => (i === index ? value : v))
  return { ...form, [side]: values }
}

/** The values a side has entered, in order: what a saved test stores as its trials. */
export function enteredValues(values: readonly Trial[]): number[] {
  return values.filter((v): v is number => v !== null)
}

function bestEntered(values: readonly Trial[]): number | null {
  const entered = enteredValues(values)
  return entered.length === 0 ? null : bestOfTrials(entered)
}

/** Each side's best: the best of the entered trials for a hop test (bestOfTrials), the one value otherwise. */
export function formBest(form: SymmetryForm): FormBest {
  return { injured: bestEntered(form.injured), other: bestEntered(form.other) }
}

/** A side's best, kept and shown: "Best 56 in" ("Best 0 in" when he couldn't hop), or that nothing is entered yet. */
export function bestWords(best: number | null, unit: string): string {
  return best === null ? 'Best: nothing entered yet' : `Best ${best} ${unit}`
}

/**
 * The live symmetry against the gate's line, from the two bests: "90.3% · the line is 90%: passes".
 * 0 on the injured side reads 0%; 0 on the other side is no percent at all, and the line says so.
 */
export function symmetryLine(best: FormBest, threshold: number): string {
  const { injured, other } = best
  if (injured === null && other === null) return 'Enter both sides to see the symmetry.'
  if (injured === null) return 'Enter the injured side to see the symmetry.'
  if (other === null) return 'Enter the other side to see the symmetry.'
  const pct = symmetryPercent(injured, other)
  if (pct === null) return injured === 0 ? 'Both sides are 0, so there is no percent.' : 'The other side is 0, so there is no percent.'
  return `${pct}% · the line is ${lineWords(threshold)}: ${meetsSymmetry(injured, other, threshold) ? 'passes' : 'not yet'}`
}

/**
 * Why the form can't be saved yet, in words, or null when it can. A hop test saves with at least
 * one trial entered on each side, a 0 included (Shawn, Nov 2), but not when the other side's best
 * is 0: that is no percent. A load test needs a load on each side.
 */
export function formBlocker(form: SymmetryForm, trials: number | null): string | null {
  const best = formBest(form)
  if (trials !== null) {
    if (best.injured === null || best.other === null) return 'Enter at least one trial on each side to save'
    if (symmetryPercent(best.injured, best.other) === null) return best.injured === 0 ? 'Both sides are 0, so there is no percent to save' : 'The other side is 0, so there is no percent to save'
    return null
  }
  if (best.injured === null || best.other === null || !(best.injured > 0) || !(best.other > 0)) return 'Enter both sides to save'
  return null
}

export type TestDraft = { ok: true; test: GateTest } | { ok: false; blocker: string }

/**
 * The GateTest a symmetry form saves: the best of each side as the values, the entered trials when
 * the item has trials (a trial not entered isn't stored), and the pass from meetsSymmetry against
 * the item's line. Never manual.
 */
export function buildTest(input: { gate: Pick<Gate, 'number'>; item: GateItem; form: SymmetryForm; today: IsoDate; id: string }): TestDraft {
  const { gate, item, form, today, id } = input
  if (!item.testItem) return { ok: false, blocker: 'This item has no test key in the program data' }
  const trials = item.trials ?? null
  const blocker = formBlocker(form, trials)
  if (blocker) return { ok: false, blocker }
  const { injured, other } = formBest(form)
  // formBlocker has already said no to a side with nothing entered; this only narrows the types.
  if (injured === null || other === null) return { ok: false, blocker: 'Enter both sides to save' }
  return {
    ok: true,
    test: {
      id,
      date: today,
      gate: gate.number,
      item: item.testItem,
      valueInjured: injured,
      valueOther: other,
      ...(trials !== null ? { trialsInjured: enteredValues(form.injured), trialsOther: enteredValues(form.other) } : {}),
      pass: meetsSymmetry(injured, other, lineOf(item)),
      manual: false,
    },
  }
}

/** A manual item's toggle: a new test each time, the latest wins; unticking writes pass false. */
export function manualTest(input: { gate: Pick<Gate, 'number'>; item: Pick<GateItem, 'id'>; pass: boolean; today: IsoDate; id: string }): GateTest {
  return { id: input.id, date: input.today, gate: input.gate.number, item: input.item.id, valueInjured: 0, valueOther: 0, pass: input.pass, manual: true }
}

export interface EarlierTest {
  id: string
  when: string
  percent: string
  values: string
  pass: boolean
  word: string
}

/** The item's tests so far, newest first: date, percent, the values compared and whether it reached the line. */
export function earlierTests(tests: readonly GateTest[], gate: number, key: string, threshold: number, unit: string): EarlierTest[] {
  return orderedTests(tests.filter((t) => t.gate === gate && t.item === key && !t.manual))
    .reverse()
    .map((t) => {
      const injured = t.trialsInjured?.length ? bestOfTrials(t.trialsInjured) : t.valueInjured
      const other = t.trialsOther?.length ? bestOfTrials(t.trialsOther) : t.valueOther
      const pct = symmetryPercent(injured, other)
      const pass = meetsSymmetry(injured, other, threshold)
      return {
        id: t.id,
        when: dateInWords(t.date),
        percent: pct === null ? 'no percent (the other side was 0)' : `${pct}%`,
        values: `${injured} vs ${other} ${unit}`,
        pass,
        word: pass ? '✓ passes' : '○ not yet',
      }
    })
}

/** Where a load form's numbers came from, in one sentence. */
export function prefillWords(exercise: Pick<Exercise, 'name' | 'loadUnit'> | null, prefill: LoadPrefill | null, injuredSide: Side): string {
  if (!exercise) return 'Nothing to prefill from: enter the values from the test.'
  if (!prefill) return `Nothing to prefill: no session has logged both sides of this exercise (${exercise.name}) yet. Enter the loads from the test.`
  const unit = exercise.loadUnit === 'none' ? '' : ` ${exercise.loadUnit}`
  const injured = SIDE_WORD[injuredSide].toLowerCase()
  const other = SIDE_WORD[otherSide(injuredSide)].toLowerCase()
  return `Prefilled from ${dateInWords(prefill.date)}’s session: ${exercise.name}, ${prefill.injured}${unit} ${injured} and ${prefill.other}${unit} ${other}, the heaviest set on each side. Change either to what the test lifted.`
}

// ---------------------------------------------------------------------------------------------
// Advancing the phase
// ---------------------------------------------------------------------------------------------

export type AdvanceState = { enabled: true } | { enabled: false; why: string }

/**
 * Whether the Advance phase button is live: only when every item passes (evaluateGate), and not
 * while the red-flag state suspends progression (rule 9). Disabled, it says why in words.
 */
export function advanceState(result: { items: readonly { pass: boolean }[]; passes: boolean }, redFlag: RedFlagState): AdvanceState {
  if (progressionSuspended(redFlag)) return { enabled: false, why: 'The red-flag state is on: clear it in Settings, with a note, before advancing' }
  if (!result.passes) {
    const failing = result.items.filter((i) => !i.pass).length
    return { enabled: false, why: failing === 1 ? '1 item doesn’t pass yet' : `${failing} items don’t pass yet` }
  }
  return { enabled: true }
}

function phaseTitle(phases: readonly Phase[], number: number): string {
  const phase = phases.find((p) => p.number === number)
  return phase ? `Phase ${number}: ${phase.name}` : `Phase ${number}`
}

/** The inline confirm's question. Phase 4 has no sessions yet, so its question says so instead. */
export function advanceQuestion(gate: Pick<Gate, 'toPhase'>, phases: readonly Phase[]): string {
  const title = phaseTitle(phases, gate.toPhase)
  if (gate.toPhase === 4) return `Advance to ${title}? Its sessions arrive with the next program update; until then Today says they are not written yet.`
  return `Advance to ${title}? From the next session the templates change and week bands count from this week.`
}

/** What the screen says once the phase has advanced. */
export function advancedWords(settings: Pick<Settings, 'currentPhase' | 'phaseEnteredWeek'>, phases: readonly Phase[]): string {
  return `${phaseTitle(phases, settings.currentPhase)}, entered in week ${settings.phaseEnteredWeek}.`
}

/** Phase 4: no gate leads out of it yet. */
export function noGateWords(gates: readonly Gate[], currentPhase: number): string {
  const passed = gates.find((g) => g.toPhase === currentPhase)
  if (passed && currentPhase === 4) return `Gate ${passed.number} passed; Phase 4’s sessions arrive with the next program update.`
  return `No gate leads out of Phase ${currentPhase} in the program data.`
}

/** A record without one key: the screen's per-item drafts, errors and saved lines. */
export function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(record)) if (k !== key) out[k] = v
  return out
}

/** A rejected write, in words. */
export function errorWords(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.trim().length > 0 ? text.trim() : 'no reason was given'
}

export function testErrorSentence(error: unknown): string {
  return `The test did not save (${errorWords(error)}). Nothing was written; tap Save again.`
}

export function tickErrorSentence(error: unknown): string {
  return `The change did not save (${errorWords(error)}). The item is as it was; tap it again.`
}

export function advanceErrorSentence(error: unknown): string {
  return `The phase did not advance (${errorWords(error)}). Nothing changed; tap Yes, advance to try again.`
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------

export interface SymmetryEntry {
  /** The GateTest.item key; null when the program data names none (the form then can't save). */
  key: string | null
  threshold: number
  /** Trials per side for a hop test; null for a one-value load test. */
  trials: number | null
  unit: string
  step: number
  prefill: LoadPrefill | null
  /** Where a load form's numbers came from; null for hop tests. */
  prefillLine: string | null
  earlier: EarlierTest[]
  sides: { injured: string; other: string }
}

interface ItemBase {
  item: GateItem
  pass: boolean
  mark: string
  word: string
  detail: string
}

export type ItemView = (ItemBase & { kind: 'auto' }) | (ItemBase & { kind: 'manual' }) | (ItemBase & { kind: 'symmetry'; entry: SymmetryEntry })

export type GatesView =
  | { kind: 'no-gate'; line: string }
  | {
      kind: 'gate'
      gate: Gate
      result: GateResult
      countLine: string
      items: ItemView[]
      advance: AdvanceState
      question: string
      /** The stop message while the red-flag state is on (rule 9), else null. */
      stop: { headline: string; items: string[] } | null
    }

function symmetryEntry(item: GateItem, gate: Gate, history: HistoryLike, records: readonly WorkoutRecord[], injuredSide: Side, exercises: readonly Exercise[]): SymmetryEntry {
  const key = item.testItem ?? null
  const threshold = lineOf(item)
  const trials = item.trials ?? null
  const sides = sideNames(injuredSide)
  if (trials !== null) {
    return { key, threshold, trials, unit: 'in', step: 1, prefill: null, prefillLine: null, earlier: key ? earlierTests(history.gateTests, gate.number, key, threshold, 'in') : [], sides }
  }
  // The program data names the exercise whose sets prefill a load test (PROGRAM-QUESTIONS 25: "prefilled
  // from the latest SetLogs per side"); hop tests have no logged exercise to start from.
  const exerciseId = item.prefillExerciseId
  const exercise = exerciseId ? (exercises.find((e) => e.id === exerciseId) ?? null) : null
  const prefill = exercise ? loadPrefill(records, exercise.id, injuredSide) : null
  const unit = exercise && exercise.loadUnit !== 'none' ? exercise.loadUnit : 'lb'
  return {
    key,
    threshold,
    trials: null,
    unit,
    step: exercise && exercise.increment > 0 ? exercise.increment : 5,
    prefill,
    prefillLine: prefillWords(exercise, prefill, injuredSide),
    earlier: key ? earlierTests(history.gateTests, gate.number, key, threshold, unit) : [],
    sides,
  }
}

function itemView(r: GateItemResult, gate: Gate, history: HistoryLike, records: readonly WorkoutRecord[], injuredSide: Side, exercises: readonly Exercise[]): ItemView {
  const base: ItemBase = { item: r.item, pass: r.pass, ...stateWords(r.pass), detail: detailWords(r.detail) }
  if (r.item.evaluator === 'manual') return { ...base, kind: 'manual' }
  if (r.item.evaluator === 'symmetry') return { ...base, kind: 'symmetry', entry: symmetryEntry(r.item, gate, history, records, injuredSide, exercises) }
  return { ...base, kind: 'auto' }
}

/** What the Gates screen shows: the current gate evaluated live, item by item, and whether it may advance. */
export function gatesView(input: { today: IsoDate; settings: Settings; history: HistoryLike; program: ProgramLike }): GatesView {
  const { today, settings, history, program } = input
  const gate = currentGate(program.gates, settings.currentPhase)
  if (!gate) return { kind: 'no-gate', line: noGateWords(program.gates, settings.currentPhase) }
  const records = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const result = evaluateGate(gate, gateContext({ today, settings, history, records }))
  return {
    kind: 'gate',
    gate,
    result,
    countLine: passCountWords(result),
    items: result.items.map((r) => itemView(r, gate, history, records, settings.injuredSide, program.exercises)),
    advance: advanceState(result, settings.redFlag),
    question: advanceQuestion(gate, program.phases),
    stop: stopMessage(settings.redFlag, program.redFlags),
  }
}
