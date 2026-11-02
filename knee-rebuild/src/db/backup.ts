import { db, type SettingsRow } from './db.ts'
import { ensureLocations, forgetSwaps, getSettings, saveSettings, SETTINGS_ID, type HomeLists } from './repo.ts'
import { BACKUP_TABLES, backupFrom, buildBackup, type Backup, type ExportResult, type StoredContents } from '../rules/backup.ts'
import { Settings, type IsoDate, type IsoDateTime } from '../schema/index.ts'

/**
 * Export and import (M6 brief, section 2): read every table, and replace every table in one
 * transaction. What the file is, and whether one may be imported, is src/rules/backup.ts's call;
 * this file only moves rows.
 */

/** The settings row aside, every Dexie table is one the file carries; a table added to db.ts and not to the file stops both directions here, before anything is read or written. */
function checkCovered(): void {
  const carried = new Set<string>(['settings', ...BACKUP_TABLES])
  const missing = db.tables.map((t) => t.name).filter((name) => !carried.has(name))
  if (missing.length > 0) throw new Error(`The backup doesn’t carry the ${missing.join(', ')} table yet.`)
}

/** Everything the phone holds, read in one transaction so the file is one moment's data: the settings row without its key, and every table as stored. */
export async function readStored(): Promise<StoredContents> {
  checkCovered()
  return db.transaction('r', db.tables, async () => {
    const row = await db.settings.get(SETTINGS_ID)
    let settings: Settings | undefined
    if (row) {
      const { id: _id, ...rest } = row
      void _id
      settings = rest
    }
    return {
      settings,
      workouts: await db.workouts.toArray(),
      setLogs: await db.setLogs.toArray(),
      morningChecks: await db.morningChecks.toArray(),
      runs: await db.runs.toArray(),
      gateTests: await db.gateTests.toArray(),
      sessionMoves: await db.sessionMoves.toArray(),
      locations: await db.locations.toArray(),
      programOverrides: await db.programOverrides.toArray(),
    }
  })
}

/** The file for what the phone holds now, stamped `exportedAt` (src/rules/backup.ts `buildBackup`). */
export async function exportBackup(exportedAt: IsoDateTime): Promise<ExportResult> {
  return buildBackup(await readStored(), exportedAt)
}

/** Records that the file stamped `exportedAt` left the phone: Settings' "Last export" and Today's reminder read it. */
export async function markExported(exportedAt: IsoDateTime): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = await getSettings()
    if (!settings) throw new Error('no settings row to record the export on')
    await saveSettings({ ...settings, lastExportedAt: exportedAt })
  })
}

/**
 * Replaces everything on the phone with a backup read by `parseBackup`, all or nothing: the file is
 * read through the rules once more before the transaction opens, then every table is cleared and
 * written in one transaction, so a refusal or a failed write leaves the phone as it was. The
 * settings come from the file with `lastExportedAt` set to the file's `exportedAt` (the phone now
 * holds what that file holds); a file with no home gym gets one through `ensureLocations`, the
 * launch path, from its own settings. The runner's stored swaps go, as on Reset.
 */
export async function replaceAll(backup: Backup, lists: HomeLists, createdOn: IsoDate): Promise<void> {
  checkCovered()
  const read = backupFrom(backup)
  if (!read.ok) throw new Error(read.refusal)
  const file = read.backup
  const settings: SettingsRow = { ...Settings.parse({ ...file.settings, lastExportedAt: file.exportedAt }), id: SETTINGS_ID }
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    await db.settings.put(settings)
    for (const name of BACKUP_TABLES) await db.table(name).bulkAdd(file[name])
    await ensureLocations(lists, createdOn)
  })
  forgetSwaps()
}
