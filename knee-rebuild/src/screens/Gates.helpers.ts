import type { History } from '../db/repo.ts'
import { evaluateGate, type GateContext, type GateItemResult, type GateResult } from '../rules/gates.ts'
import { attachChecks, subjectReadings, type SubjectReading, type WorkoutRecord } from '../rules/history.ts'
import { weekOf } from '../rules/calendar.ts'
import { locationOrHome } from '../rules/locations.ts'
import { advanceWaitsFor, awaitingMorningCheck, loadTestPrefill, phaseEntryWeek, type LoadTestPrefill, type LoadTestSession } from '../rules/progress.ts'
import { progressionSuspended, stopMessage, type RedFlagState } from '../rules/redFlags.ts'
import { phaseRunsExercise } from '../rules/session.ts'
import { bestOfTrials, meetsSymmetry, symmetryPercent } from '../rules/unilateral.ts'
import type { Exercise, Gate, GateItem, GateTest, IsoDate, Location, Phase, Program, Settings, Side } from '../schema/index.ts'
import { dateWords, runLabel, shortDateWords, workoutLabel } from './Today.helpers.ts'

/**
 * Pure helpers for the Gates screen: the context the gate rule reads, assembled from what is
 * logged; the words for each item's state and detail; the symmetry entry forms (best of the trials,
 * the live percent against the gate's line, the prefill from logged sets); the tests the screen
 * writes; and whether the phase may advance. Every verdict comes from src/rules (evaluateGate,
 * meetsSymmetry, symmetryPercent, bestOfTrials, progressionSuspended, loadTestPrefill); this file only
 * composes the answers and names them. The program pieces are passed in, so tests use fixtures.
 */

export type HistoryLike = Pick<History, 'workouts' | 'setLogs' | 'morningChecks' | 'runs' | 'gateTests' | 'sessionMoves'>
export type ProgramLike = Pick<Program, 'gates' | 'phases' | 'exercises' | 'redFlags' | 'templates' | 'weeklyTemplate'>

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

const RESULT_WORD: Record<SubjectReading['result'], string> = { clean: 'Clean', hold: 'Hold', 'back-off': 'Back off' }

/** "Session A", "Run: long": what a reading was of. */
function readingLabel(reading: Pick<SubjectReading, 'kind' | 'id'>, history: Pick<HistoryLike, 'workouts' | 'runs'>, templates: ProgramLike['templates']): string {
  if (reading.kind === 'run') {
    const run = history.runs.find((r) => r.id === reading.id)
    return run ? runLabel(run.type) : 'A run'
  }
  const workout = history.workouts.find((w) => w.id === reading.id)
  return workout ? workoutLabel(workout, templates) : 'A session'
}

/**
 * The clean-weeks detail with each reading that isn't clean named: "Hold on Tuesday Nov 17
 * (Session A).", as Progress names the last one; and a reading that is hold only because its
 * morning check is still due (awaitingMorningCheck) says so, with what to do: "Saturday Nov 21’s
 * Session A reads hold until its morning check is in; log it to count." The gate still reads it as
 * hold until then (rule 3, PROGRAM-QUESTIONS 109).
 */
export function cleanWeeksWords(detail: string, misses: readonly SubjectReading[], input: { today: IsoDate; history: HistoryLike; templates: ProgramLike['templates'] }): string {
  const named = misses.map((m) => {
    const label = readingLabel(m, input.history, input.templates)
    const when = dateInWords(m.date)
    if (awaitingMorningCheck(m, input.history.morningChecks, input.today)) return `${when}’s ${label} reads hold until its morning check is in; log it to count.`
    return `${RESULT_WORD[m.result]} on ${when} (${label}).`
  })
  return [detailWords(detail), ...named].join(' ')
}

// ---------------------------------------------------------------------------------------------
// Symmetry entry
// ---------------------------------------------------------------------------------------------

/** The session a load form opens on: loadTestPrefill's pick (src/rules/progress.ts). */
export type LoadPrefill = LoadTestSession

/**
 * One value in a form: a trial or a load, or null when it isn't entered. A hop trial of 0 is a
 * trial (he couldn't hop), not a blank (PROGRAM-QUESTIONS 108); the Stepper can only show numbers,
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
export function openForm(trials: number | null, prefill: Pick<LoadPrefill, 'injured' | 'other'> | null): SymmetryForm {
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

/**
 * Where Enter puts a value that isn't entered yet: a hop trial at 0, since 0 is a trial (a hop he
 * couldn't do, PROGRAM-QUESTIONS 108); a load at the exercise's first step, since a load test needs
 * a load on each side and 0 lb can't be saved.
 */
export function enterStart(entry: { trials: number | null; step: number }): number {
  return entry.trials !== null ? 0 : entry.step
}

/**
 * A hop trial's full name, with its side: "Right · injured, trial 1". The screen shows "Trial 1"
 * under the side's legend, and every control of the trial (Enter, Clear, the field, up and down)
 * carries the side, so a screen reader never meets two "Trial 1"s on one item.
 */
export function trialName(sideName: string, index: number): string {
  return `${sideName}, trial ${index + 1}`
}

/** The Clear button's name: "Clear left, trial 1: back to not entered". */
export function clearWords(name: string): string {
  return `Clear ${name.toLowerCase()}: back to not entered`
}

/** The Enter button's name: "Enter right · injured, starting at 5 lb", "Enter trial 1, starting at 0 in". */
export function enterWords(label: string, start: number, unit: string): string {
  return `Enter ${label.toLowerCase()}, starting at ${start} ${unit}`
}

/** A side's best, kept and shown: "Best 56 in" ("Best 0 in" when he couldn't hop), or that nothing is entered yet. */
export function bestWords(best: number | null, unit: string): string {
  return best === null ? 'Best: nothing entered yet' : `Best ${best} ${unit}`
}

/** Why a load test with a 0 on a side can't save: the line and the Save button say the same. */
export const ZERO_LOAD_BLOCKER = 'A load test needs a load on each side, so 0 can’t be saved'

/**
 * The live symmetry against the gate's line, from the two bests: "90.3% · the line is 90%: passes".
 * On a hop test 0 on the injured side reads 0%, and 0 on the other side is no percent at all, and
 * the line says so. On a load test (`loadTest`) a 0 on either side can't be saved, so the line says
 * what Save says rather than a percent beside a refusal.
 */
export function symmetryLine(best: FormBest, threshold: number, loadTest = false): string {
  const { injured, other } = best
  if (injured === null && other === null) return 'Enter both sides to see the symmetry.'
  if (injured === null) return 'Enter the injured side to see the symmetry.'
  if (other === null) return 'Enter the other side to see the symmetry.'
  if (loadTest && !(injured > 0 && other > 0)) return `${ZERO_LOAD_BLOCKER}.`
  const pct = symmetryPercent(injured, other)
  if (pct === null) return injured === 0 ? 'Both sides are 0, so there is no percent.' : 'The other side is 0, so there is no percent.'
  return `${pct}% · the line is ${lineWords(threshold)}: ${meetsSymmetry(injured, other, threshold) ? 'passes' : 'not yet'}`
}

/** Two forms hold the same values, side by side and trial by trial (not entered included). */
export function sameForm(a: SymmetryForm, b: SymmetryForm): boolean {
  const same = (x: readonly Trial[], y: readonly Trial[]) => x.length === y.length && x.every((v, i) => v === y[i])
  return same(a.injured, b.injured) && same(a.other, b.other)
}

/** Why Save waits right after a save: the form still holds the test just written. */
export const SAVED_BLOCKER = 'Saved; change a value to save another'

/**
 * Why the form can't be saved yet, in words, or null when it can. A hop test saves with at least
 * one trial entered on each side, a 0 included (Shawn, Nov 2), but not when the other side's best
 * is 0: that is no percent. A load test needs a load on each side. Right after a save the form
 * keeps what was saved (`lastSaved`), and Save waits until a value changes, so a second tap never
 * writes the same test twice, or a prefill no test lifted.
 */
export function formBlocker(form: SymmetryForm, trials: number | null, lastSaved: SymmetryForm | null = null): string | null {
  if (lastSaved && sameForm(form, lastSaved)) return SAVED_BLOCKER
  const best = formBest(form)
  if (trials !== null) {
    if (best.injured === null || best.other === null) return 'Enter at least one trial on each side to save'
    if (symmetryPercent(best.injured, best.other) === null) return best.injured === 0 ? 'Both sides are 0, so there is no percent to save' : 'The other side is 0, so there is no percent to save'
    return null
  }
  if (best.injured === null || best.other === null) return 'Enter both sides to save'
  if (!(best.injured > 0) || !(best.other > 0)) return ZERO_LOAD_BLOCKER
  return null
}

export type TestDraft = { ok: true; test: GateTest } | { ok: false; blocker: string }

/**
 * The GateTest a symmetry form saves: the best of each side as the values, the entered trials when
 * the item has trials (a trial not entered isn't stored), and the pass from meetsSymmetry against
 * the item's line. Never manual.
 */
export function buildTest(input: { gate: Pick<Gate, 'number'>; item: GateItem; form: SymmetryForm; today: IsoDate; id: string; lastSaved?: SymmetryForm | null }): TestDraft {
  const { gate, item, form, today, id } = input
  if (!item.testItem) return { ok: false, blocker: 'This item has no test key in the program data' }
  const trials = item.trials ?? null
  const blocker = formBlocker(form, trials, input.lastSaved ?? null)
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

type PassedOver = LoadTestPrefill['passedOver']

const sessionsWord = (n: number) => (n === 1 ? 'a later session' : `${n} later sessions`)

/** What the prefill passed over, in one sentence, or null when nothing was. */
function passedOverWords({ rackCapped, noLoad }: PassedOver): string | null {
  const total = rackCapped + noLoad
  if (total === 0) return null
  if (noLoad === 0) return `Passed over ${sessionsWord(total)} that the rack capped.`
  if (rackCapped === 0) return `Passed over ${sessionsWord(total)} with no load on a side.`
  return `Passed over ${total} later sessions: ${rackCapped} that the rack capped, ${noLoad} with no load on a side.`
}

/**
 * Where a load form's numbers came from, in one sentence or three: the session, the gym when it
 * isn't the one Today plans at, and the later sessions loadTestPrefill passed over (rack-capped, or
 * no load on a side; PROGRAM-QUESTIONS 115). `notRunIn` is the phase when it runs no slot of the
 * exercise, so no session of it can prefill the test (gate 1, PROGRAM-QUESTIONS 114).
 */
export function prefillWords(input: {
  exercise: Pick<Exercise, 'name' | 'loadUnit'> | null
  prefill: LoadPrefill | null
  injuredSide: Side
  notRunIn?: number | null
  gymName?: string | null
  passedOver?: PassedOver
}): string {
  const { exercise, prefill, injuredSide } = input
  const passedOver = input.passedOver ?? { rackCapped: 0, noLoad: 0 }
  if (!exercise) return 'Nothing to prefill from: enter the values from the test.'
  if (input.notRunIn !== undefined && input.notRunIn !== null) return `Phase ${input.notRunIn} doesn’t run this exercise (${exercise.name}), so no session can prefill this test. Enter the loads from the test.`
  if (!prefill) {
    const { rackCapped, noLoad } = passedOver
    if (rackCapped + noLoad === 0) return `Nothing to prefill: no session has logged both sides of this exercise (${exercise.name}) yet. Enter the loads from the test.`
    const why = noLoad === 0 ? 'was rack-capped' : rackCapped === 0 ? 'had no load on a side' : 'was rack-capped or had no load on a side'
    return `Nothing to prefill: every session that logged both sides of this exercise (${exercise.name}) ${why}. Enter the loads from the test.`
  }
  const unit = exercise.loadUnit === 'none' ? '' : ` ${exercise.loadUnit}`
  const injured = SIDE_WORD[injuredSide].toLowerCase()
  const other = SIDE_WORD[otherSide(injuredSide)].toLowerCase()
  const where = input.gymName ? ` at ${input.gymName}` : ''
  const over = passedOverWords(passedOver)
  return `Prefilled from ${dateInWords(prefill.date)}’s session${where}: ${exercise.name}, ${prefill.injured}${unit} ${injured} and ${prefill.other}${unit} ${other}, the heaviest set on each side.${over ? ` ${over}` : ''} Change either to what the test lifted.`
}

// ---------------------------------------------------------------------------------------------
// Advancing the phase
// ---------------------------------------------------------------------------------------------

export type AdvanceState = { enabled: true } | { enabled: false; why: string }

/** A session still open, as the Advance button names it: "Session C" and "Saturday, November 21". */
export interface OpenSession {
  label: string
  dateWords: string
}

/**
 * Whether the Advance phase button is live: only when every item passes (evaluateGate), not while
 * the red-flag state suspends progression (rule 9), and not while a session is open
 * (advanceWaitsFor, PROGRAM-QUESTIONS 117). Disabled, it says why in words.
 */
export function advanceState(result: { items: readonly { pass: boolean }[]; passes: boolean }, redFlag: RedFlagState, open: readonly OpenSession[] = []): AdvanceState {
  if (progressionSuspended(redFlag)) return { enabled: false, why: 'The red-flag state is on: clear it in Settings, with a note, before advancing' }
  if (!result.passes) {
    const failing = result.items.filter((i) => !i.pass).length
    return { enabled: false, why: failing === 1 ? '1 item doesn’t pass yet' : `${failing} items don’t pass yet` }
  }
  const [first] = open
  if (first && open.length === 1) return { enabled: false, why: `${first.label} from ${first.dateWords} is still open: finish it or end it early, then advance` }
  if (open.length > 1) return { enabled: false, why: `${open.length} sessions are still open: finish them or end them early, then advance` }
  return { enabled: true }
}

function phaseTitle(phases: readonly Phase[], number: number): string {
  const phase = phases.find((p) => p.number === number)
  return phase ? `Phase ${number}: ${phase.name}` : `Phase ${number}`
}

/**
 * The inline confirm's question, with the week the bands count from: the week the phase is entered
 * (phaseEntryWeek) against this program week. Once this week's lifts have begun, that is next week
 * (PROGRAM-QUESTIONS 113). Phase 4 has no sessions yet, so its question says so instead.
 */
export function advanceQuestion(gate: Pick<Gate, 'toPhase'>, phases: readonly Phase[], entryWeek: number, currentWeek: number): string {
  const title = phaseTitle(phases, gate.toPhase)
  if (gate.toPhase === 4) return `Advance to ${title}? Its sessions arrive with the next program update; until then Today says they are not written yet.`
  const lead = `Advance to ${title}? From the next session the templates change`
  if (currentWeek < 1) return `${lead} and week bands count from week ${entryWeek}.`
  if (entryWeek > currentWeek) return `${lead}; week bands count from next week, week ${entryWeek}, since this week’s lifts have begun.`
  return `${lead} and week bands count from this week.`
}

/** How the inline confirm closed: Not yet, Yes (the phase advanced), or a change to the checklist under it. */
export type ConfirmClose = 'not-yet' | 'advanced' | 'checklist'

/**
 * Where focus goes when the confirm closes, so a VoiceOver user is never left on the page: Not yet
 * back to Advance phase; Yes to the line saying what changed, since the Advance button is then the
 * next gate's and disabled, and focus on it would fall to the page; a tick or a save in the
 * checklist leaves focus where the tap was.
 */
export function focusAfterConfirm(closedBy: ConfirmClose): 'advance-button' | 'advanced-line' | null {
  if (closedBy === 'not-yet') return 'advance-button'
  if (closedBy === 'advanced') return 'advanced-line'
  return null
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
      /** The program week Yes, advance enters the next phase in (phaseEntryWeek). */
      entryWeek: number
      question: string
      /** The stop message while the red-flag state is on (rule 9), else null. */
      stop: { headline: string; items: string[] } | null
    }

/** Where the screen's gyms stand: every stored gym, and the one Today plans at. */
interface Gyms {
  locations: readonly Location[]
  activeId: string | undefined
}

/** The gym's name when a session ran away from the one Today plans at, else null. */
function awayGymName(locationId: string, gyms: Gyms): string | null {
  const active = locationOrHome(gyms.locations, gyms.activeId)
  const there = locationOrHome(gyms.locations, locationId)
  return active && there && there.id !== active.id ? there.name : null
}

function symmetryEntry(item: GateItem, gate: Gate, history: HistoryLike, records: readonly WorkoutRecord[], injuredSide: Side, program: ProgramLike, gyms: Gyms): SymmetryEntry {
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
  const exercise = exerciseId ? (program.exercises.find((e) => e.id === exerciseId) ?? null) : null
  // A phase that runs no slot of the exercise can't produce a session to prefill from (PROGRAM-QUESTIONS 114).
  const runs = exercise !== null && phaseRunsExercise(program.templates, gate.fromPhase, exercise.id)
  const found = exercise && runs ? loadTestPrefill(records, exercise.id, injuredSide) : null
  const prefill = found?.prefill ?? null
  const unit = exercise && exercise.loadUnit !== 'none' ? exercise.loadUnit : 'lb'
  return {
    key,
    threshold,
    trials: null,
    unit,
    step: exercise && exercise.increment > 0 ? exercise.increment : 5,
    prefill,
    prefillLine: prefillWords({
      exercise,
      prefill,
      injuredSide,
      notRunIn: exercise && !runs ? gate.fromPhase : null,
      gymName: prefill ? awayGymName(prefill.locationId, gyms) : null,
      ...(found ? { passedOver: found.passedOver } : {}),
    }),
    earlier: key ? earlierTests(history.gateTests, gate.number, key, threshold, unit) : [],
    sides,
  }
}

function itemView(r: GateItemResult, gate: Gate, today: IsoDate, history: HistoryLike, records: readonly WorkoutRecord[], injuredSide: Side, program: ProgramLike, gyms: Gyms): ItemView {
  const detail = r.misses && r.misses.length > 0 ? cleanWeeksWords(r.detail, r.misses, { today, history, templates: program.templates }) : detailWords(r.detail)
  const base: ItemBase = { item: r.item, pass: r.pass, ...stateWords(r.pass), detail }
  if (r.item.evaluator === 'manual') return { ...base, kind: 'manual' }
  if (r.item.evaluator === 'symmetry') return { ...base, kind: 'symmetry', entry: symmetryEntry(r.item, gate, history, records, injuredSide, program, gyms) }
  return { ...base, kind: 'auto' }
}

/**
 * What the Gates screen shows: the current gate evaluated live, item by item, and whether it may
 * advance. `locations` lets a prefill line name a gym away from the one Today plans at.
 */
export function gatesView(input: { today: IsoDate; settings: Settings; history: HistoryLike; program: ProgramLike; locations?: readonly Location[] }): GatesView {
  const { today, settings, history, program } = input
  const gyms: Gyms = { locations: input.locations ?? [], activeId: settings.activeLocationId }
  const gate = currentGate(program.gates, settings.currentPhase)
  if (!gate) return { kind: 'no-gate', line: noGateWords(program.gates, settings.currentPhase) }
  const records = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const result = evaluateGate(gate, gateContext({ today, settings, history, records }))
  const entryWeek = phaseEntryWeek({ today, startDate: settings.startDate, template: program.weeklyTemplate, moves: history.sessionMoves, workouts: history.workouts })
  return {
    kind: 'gate',
    gate,
    result,
    countLine: passCountWords(result),
    items: result.items.map((r) => itemView(r, gate, today, history, records, settings.injuredSide, program, gyms)),
    advance: advanceState(
      result,
      settings.redFlag,
      advanceWaitsFor(history.workouts).map((w) => ({ label: workoutLabel(w, program.templates), dateWords: dateWords(w.date) })),
    ),
    entryWeek,
    question: advanceQuestion(gate, program.phases, entryWeek, weekOf(today, settings.startDate)),
    stop: stopMessage(settings.redFlag, program.redFlags),
  }
}
