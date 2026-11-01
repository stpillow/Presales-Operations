import { db, type SettingsRow } from './db.ts'
import {
  GateTest,
  MorningCheck,
  Run,
  SessionMove,
  SetLog,
  Settings,
  Workout,
  type Program,
  type SetSide,
} from '../schema/index.ts'

/**
 * Every write goes through a strict Zod parse first, so nothing malformed reaches IndexedDB.
 * Nothing in here decides anything; decisions live in src/rules.
 */

export const SETTINGS_ID = 'settings' as const

/** Settings for a fresh install: the program's own start date and injured side, Shawn's answers to section 9. */
export function defaultSettings(program: Pick<Program, 'startDate' | 'injuredSide'>): Settings {
  return Settings.parse({
    injuredSide: program.injuredSide,
    startDate: program.startDate,
    dumbbellMax: 80,
    restTimerSeconds: 60,
    painPerSet: false,
  })
}

export async function getSettings(): Promise<Settings | undefined> {
  const row = await db.settings.get(SETTINGS_ID)
  if (!row) return undefined
  const { id: _id, ...rest } = row
  return Settings.parse(rest)
}

export async function saveSettings(settings: Settings): Promise<void> {
  const row: SettingsRow = { ...Settings.parse(settings), id: SETTINGS_ID }
  await db.settings.put(row)
}

/** Seed on first run: create the settings row if it is missing, and return it. */
export async function ensureSettings(defaults: Settings): Promise<Settings> {
  const existing = await getSettings()
  if (existing) return existing
  await saveSettings(defaults)
  return defaults
}

export async function putWorkout(workout: Workout): Promise<void> {
  await db.workouts.put(Workout.parse(workout))
}

export async function updateWorkout(id: string, patch: Partial<Workout>): Promise<void> {
  const current = await db.workouts.get(id)
  if (!current) throw new Error(`no workout ${id}`)
  await db.workouts.put(Workout.parse({ ...current, ...patch }))
}

/** A set's id is its coordinates, so logging the same set twice overwrites instead of duplicating. */
export function setId(workoutId: string, slotId: string, side: SetSide, setNumber: number): string {
  return `${workoutId}:${slotId}:${side}:${setNumber}`
}

export async function upsertSet(set: SetLog): Promise<void> {
  await db.setLogs.put(SetLog.parse({ ...set, id: setId(set.workoutId, set.slotId, set.side, set.setNumber) }))
}

export async function deleteSet(id: string): Promise<void> {
  await db.setLogs.delete(id)
}

export async function addMorningCheck(check: MorningCheck): Promise<void> {
  await db.morningChecks.put(MorningCheck.parse(check))
}

export async function addRun(run: Run): Promise<void> {
  await db.runs.put(Run.parse(run))
}

export async function addGateTest(test: GateTest): Promise<void> {
  await db.gateTests.put(GateTest.parse(test))
}

export async function addSessionMove(move: SessionMove): Promise<void> {
  await db.sessionMoves.put(SessionMove.parse(move))
}

export interface History {
  workouts: Workout[]
  setLogs: SetLog[]
  morningChecks: MorningCheck[]
  runs: Run[]
  gateTests: GateTest[]
  sessionMoves: SessionMove[]
}

/** Everything the engine reads, in one go. The tables are small: one person, twelve weeks. */
export async function loadHistory(): Promise<History> {
  const [workouts, setLogs, morningChecks, runs, gateTests, sessionMoves] = await Promise.all([
    db.workouts.toArray(),
    db.setLogs.toArray(),
    db.morningChecks.toArray(),
    db.runs.toArray(),
    db.gateTests.toArray(),
    db.sessionMoves.toArray(),
  ])
  return { workouts, setLogs, morningChecks, runs, gateTests, sessionMoves }
}

/** Wipes every table, settings included. The Settings screen asks twice before calling this. */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}

/** Asks the browser to keep this origin's storage out of eviction. Best effort; iOS may say no. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist()
    }
  } catch {
    // Private browsing or an old browser: nothing to do.
  }
  return false
}
