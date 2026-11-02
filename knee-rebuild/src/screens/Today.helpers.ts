import type { History } from '../db/repo.ts'
import { addDays, dayOf, isDeloadWeek, scheduledSession } from '../rules/calendar.ts'
import { attachChecks, subjectReadings, workoutReading } from '../rules/history.ts'
import { morningCheckApplies, morningReading, type Reading } from '../rules/reading.ts'
import { phaseWeekOf } from '../rules/session.ts'
import { runsInWeek, suggestRun, targetForWeek, type RunSuggestion } from '../rules/weekPlan.ts'
import { weekMiles } from '../rules/mileage.ts'
import { stopMessage } from '../rules/redFlags.ts'
import type {
  Run,
  Day,
  DaySession,
  IsoDate,
  Phase,
  Program,
  ReadingResult,
  RunType,
  SessionLetter,
  SessionTemplate,
  Settings,
  Side,
  Workout,
} from '../schema/index.ts'

/**
 * Pure helpers for the Today screen: words for dates and sessions, which stored workout is today's,
 * and the view the screen renders. Every knee decision is asked of src/rules; this file only
 * composes the answers and names things. The program pieces are passed in, so tests use fixtures.
 */

export type HistoryLike = Pick<History, 'workouts' | 'setLogs' | 'morningChecks' | 'runs' | 'sessionMoves'>
export type ProgramLike = Pick<Program, 'phases' | 'weeklyTemplate' | 'weeklyTemplateRows' | 'redFlags' | 'templates' | 'mileagePlan'>
type TemplateRows = ProgramLike['weeklyTemplateRows']

const WEEKDAY: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthAndDay(date: IsoDate): { month: string; day: number } {
  const [, m, d] = date.split('-').map(Number)
  const month = m === undefined ? undefined : MONTH[m - 1]
  if (month === undefined || d === undefined || Number.isNaN(d)) throw new RangeError(`not a YYYY-MM-DD date: ${date}`)
  return { month, day: d }
}

/** "Tuesday, November 3": the screen's lead line. */
export function dateWords(date: IsoDate): string {
  const { month, day } = monthAndDay(date)
  return `${WEEKDAY[dayOf(date)]}, ${month} ${day}`
}

/** "Monday Nov 2": the form the start line uses. */
export function shortDateWords(date: IsoDate): string {
  const { month, day } = monthAndDay(date)
  return `${WEEKDAY[dayOf(date)]} ${month.slice(0, 3)} ${day}`
}

const RUN_LABEL: Record<RunType, string> = {
  mbr: 'Run: MBR',
  easy: 'Run: easy',
  long: 'Run: long',
  'elliptical-swap': 'Elliptical swap',
  'rower-swap': 'Rower swap',
}

export function runLabel(type: RunType): string {
  return RUN_LABEL[type]
}

export function sessionLetter(session: DaySession): SessionLetter | null {
  switch (session) {
    case 'lift:A':
      return 'A'
    case 'lift:B':
      return 'B'
    case 'lift:C':
      return 'C'
    default:
      return null
  }
}

function runTypeOf(session: DaySession): RunType | null {
  switch (session) {
    case 'run:mbr':
      return 'mbr'
    case 'run:easy':
      return 'easy'
    case 'run:long':
      return 'long'
    default:
      return null
  }
}

/** The program's own note for a session from the weekly template rows ("Kona walk and mobility only"), or null. */
export function sessionNote(session: DaySession, rows: TemplateRows): string | null {
  const letter = sessionLetter(session)
  const run = runTypeOf(session)
  const wanted = letter ? `lift ${letter}` : run ? `run: ${run}` : 'off'
  const row = rows.find((r) => r.session.trim().toLowerCase() === wanted.toLowerCase())
  const note = row?.notes.trim()
  return note ? note : null
}

/** "Session A", "Run: MBR", "Off: Kona walk and mobility only". */
export function sessionLabel(session: DaySession, rows: TemplateRows = []): string {
  const letter = sessionLetter(session)
  if (letter) return `Session ${letter}`
  const run = runTypeOf(session)
  if (run) return runLabel(run)
  const note = sessionNote('off', rows)
  return note ? `Off: ${note}` : 'Off'
}

export function phaseName(phases: readonly Phase[], number: number): string {
  return phases.find((p) => p.number === number)?.name ?? `Phase ${number}`
}

/** "Session B" for a stored workout, from its template id. */
export function workoutLabel(workout: Pick<Workout, 'templateId'>, templates: readonly SessionTemplate[]): string {
  const letter = templates.find((t) => t.id === workout.templateId)?.letter
  return letter ? `Session ${letter}` : 'Session'
}

const STATUS_RANK: Record<Workout['status'], number> = { 'in-progress': 0, finished: 1, abandoned: 2, planned: 3 }

/** The stored workout that is today's: an open one first, then a finished one, then an abandoned attempt. */
export function todaysWorkout(workouts: readonly Workout[], date: IsoDate, templateId: string | null): Workout | null {
  const candidates = workouts.filter((w) => w.date === date && (templateId === null || w.templateId === templateId))
  candidates.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
  return candidates[0] ?? null
}

/** A readable workout id that cannot collide with an earlier attempt on the same day. */
export function newWorkoutId(date: IsoDate, templateId: string, taken: readonly string[]): string {
  const base = `${date}-${templateId}`
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export interface YesterdayLine {
  label: string
  result: ReadingResult
  /** Whether a morning check already applies to it; until one does, the engine reads it as unknown. */
  checkDone: boolean
}

/** Yesterday's sessions with their readings, from the engine's subject readings. Empty when there was none. */
export function yesterdayReadings(today: IsoDate, history: HistoryLike, templates: readonly SessionTemplate[], injuredSide: Side): YesterdayLine[] {
  const yesterday = addDays(today, -1)
  const records = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  return subjectReadings(records, history.runs, history.morningChecks, injuredSide)
    .filter((s) => s.date === yesterday)
    .map((s) => {
      let label = 'Run'
      if (s.kind === 'workout') {
        const workout = history.workouts.find((w) => w.id === s.id)
        label = workout ? workoutLabel(workout, templates) : 'Session'
      } else {
        const run = history.runs.find((r) => r.id === s.id)
        if (run) label = runLabel(run.type)
      }
      const checkDone = history.morningChecks.some((c) => morningCheckApplies(c, { kind: s.kind, id: s.id, date: s.date }))
      return { label, result: s.result, checkDone }
    })
}

export interface OpenWorkout {
  workoutId: string
  label: string
  dateWords: string
}

/**
 * Workouts neither finished nor abandoned, other than the one Today resumes: the engine cannot read
 * them until they are closed, so the screen lists them whatever day they carry.
 */
export function openWorkouts(workouts: readonly Workout[], templates: readonly SessionTemplate[], resumingId: string | null = null): OpenWorkout[] {
  return workouts
    .filter((w) => w.status === 'in-progress' && w.id !== resumingId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
    .map((w) => ({ workoutId: w.id, label: workoutLabel(w, templates), dateWords: dateWords(w.date) }))
}

export type TodayBody =
  | { kind: 'stop'; headline: string; items: string[] }
  | { kind: 'before-start'; line: string }
  | {
      kind: 'lift'
      letter: SessionLetter
      label: string
      week: number
      isDeload: boolean
      /** Null when the phase has no session written (Phase 4). */
      template: SessionTemplate | null
      /** Today's stored workout for this template, if one exists. */
      workout: Workout | null
      /** The finished workout's reading, in the engine's words. */
      reading: Reading | null
      checkDone: boolean
    }
  | {
      kind: 'run'
      label: string
      note: string | null
      /** The engine's suggestion for today's run (miles under the week's ceiling, strides, tempo, a swap). */
      suggestion: RunSuggestion | null
      /** This week's miles so far and the week's target (null outside the plan), with why when capped. */
      weekMiles: number
      target: number | null
      /** The rule's own flag: true exactly when rule 7 put the target below the plan's number. */
      capped: boolean
      targetReason: string
      /** Runs already logged today. */
      loggedToday: Run[]
    }
  | { kind: 'off'; label: string }

type RunBody = Extract<TodayBody, { kind: 'run' }>

/**
 * "This week: 3 of 10 miles", and the cap's reason after it only when the rule says it capped the
 * week ("· last week read hold: capped at last week’s 6 miles"); "This week: 2 miles" outside the plan.
 */
export function runWeekWords(body: Pick<RunBody, 'weekMiles' | 'target' | 'capped' | 'targetReason'>): string {
  if (body.target === null) return `This week: ${body.weekMiles} miles`
  const line = `This week: ${body.weekMiles} of ${body.target} miles`
  return body.capped ? `${line} · ${body.targetReason}` : line
}

export interface TodayView {
  dateWords: string
  phaseNumber: number
  phaseName: string
  /** False when the program has no session written for the phase (Phase 4): nothing can be started. */
  phaseHasSessions: boolean
  /** Null before the program starts. */
  week: number | null
  deload: boolean
  body: TodayBody
  yesterday: YesterdayLine[]
  open: OpenWorkout[]
}

/** Everything the Today screen renders, from today's date, the settings, the stored history and the program. */
export function todayView(input: { today: IsoDate; settings: Settings; history: HistoryLike; program: ProgramLike }): TodayView {
  const { today, settings, history, program } = input
  const scheduled = scheduledSession(today, settings.startDate, program.weeklyTemplate, history.sessionMoves)
  const week = scheduled.session === null ? null : scheduled.week
  const letter = scheduled.session === null ? null : sessionLetter(scheduled.session)
  const template = letter ? (program.templates.find((t) => t.phase === settings.currentPhase && t.letter === letter) ?? null) : null
  const workout = template ? todaysWorkout(history.workouts, today, template.id) : null
  const base = {
    dateWords: dateWords(today),
    phaseNumber: settings.currentPhase,
    phaseName: phaseName(program.phases, settings.currentPhase),
    phaseHasSessions: program.templates.some((t) => t.phase === settings.currentPhase),
    week,
    deload: week !== null && isDeloadWeek(week),
    yesterday: yesterdayReadings(today, history, program.templates, settings.injuredSide),
    open: openWorkouts(history.workouts, program.templates, workout?.status === 'in-progress' ? workout.id : null),
  }

  const stop = stopMessage(settings.redFlag, program.redFlags)
  if (stop) return { ...base, body: { kind: 'stop', headline: stop.headline, items: stop.items } }
  if (scheduled.session === null || week === null) {
    return { ...base, body: { kind: 'before-start', line: `Week 1 starts ${shortDateWords(settings.startDate)}` } }
  }

  const session = scheduled.session
  if (letter) {
    const [record] = workout && workout.status === 'finished' ? attachChecks([workout], history.setLogs, history.morningChecks) : []
    const reading = record ? workoutReading(record, settings.injuredSide) : null
    const checkDone = record?.morningCheck !== undefined
    return {
      ...base,
      body: { kind: 'lift', letter, label: sessionLabel(session), week, isDeload: isDeloadWeek(week), template, workout, reading, checkDone },
    }
  }
  if (session === 'off') return { ...base, body: { kind: 'off', label: sessionLabel(session, program.weeklyTemplateRows) } }
  const records = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const readings = subjectReadings(records, history.runs, history.morningChecks, settings.injuredSide)
  const target = targetForWeek(program.mileagePlan, week, settings.startDate, history.runs, readings)
  const before = runsInWeek(history.runs, settings.startDate, week).filter((r) => r.date < today)
  const todays = history.runs.filter((r) => r.date === today)
  const check = history.morningChecks.find((c) => c.date === today)
  const suggestion = suggestRun({
    session,
    week,
    target: target.target,
    milesSoFar: weekMiles(before),
    currentPhase: settings.currentPhase,
    phaseWeek: phaseWeekOf(Math.max(week, settings.phaseEnteredWeek), settings.phaseEnteredWeek),
    morning: check ? morningReading(check).result : null,
  })
  return {
    ...base,
    body: {
      kind: 'run',
      label: sessionLabel(session),
      note: sessionNote(session, program.weeklyTemplateRows),
      suggestion,
      weekMiles: weekMiles([...before, ...todays]),
      target: target.target,
      capped: target.capped,
      targetReason: target.reason,
      loggedToday: todays,
    },
  }
}
