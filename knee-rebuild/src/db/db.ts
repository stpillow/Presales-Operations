import Dexie, { type EntityTable } from 'dexie'
import type { GateTest, MorningCheck, Run, SessionMove, SetLog, Settings, Workout } from '../schema/index.ts'

/** The settings row, keyed so there is exactly one. */
export type SettingsRow = Settings & { id: 'settings' }

/**
 * The app's one IndexedDB database. Schema versions are declared here and only here.
 * Version 1 (M0) was empty; version 2 (M3) adds the log tables. Never edit a shipped
 * version; add the next one, and keep every change additive.
 */
export class KneeRebuildDb extends Dexie {
  settings!: EntityTable<SettingsRow, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  setLogs!: EntityTable<SetLog, 'id'>
  morningChecks!: EntityTable<MorningCheck, 'id'>
  runs!: EntityTable<Run, 'id'>
  gateTests!: EntityTable<GateTest, 'id'>
  sessionMoves!: EntityTable<SessionMove, 'id'>

  constructor() {
    super('knee-rebuild')
    this.version(1).stores({})
    this.version(2).stores({
      settings: 'id',
      workouts: 'id, date, status, templateId',
      setLogs: 'id, workoutId, exerciseId, [workoutId+slotId]',
      morningChecks: 'id, date',
      runs: 'id, date',
      gateTests: 'id, date, [gate+item]',
      sessionMoves: 'id, week',
    })
  }
}

export const db = new KneeRebuildDb()
