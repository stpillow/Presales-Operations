import Dexie from 'dexie'

/**
 * The app's one IndexedDB database. Schema versions are declared here and only here.
 * M0 ships an empty schema; the tables arrive in M3 (settings, workouts, setLogs,
 * morningChecks, runs, gateTests). Never edit a shipped version; add the next one.
 */
export class KneeRebuildDb extends Dexie {
  constructor() {
    super('knee-rebuild')
    this.version(1).stores({})
  }
}

export const db = new KneeRebuildDb()
