import type { IsoDate, MorningCheck, RedFlag, Settings } from '../schema/index.ts'

export type RedFlagState = Settings['redFlag']

export const NO_RED_FLAG: RedFlagState = { active: false, items: [] }

export const STOP_HEADLINE = 'Stop. Call the ortho or PT.'

/** Rule 9: any ticked red flag on a morning check puts the app in the red-flag state. */
export function afterMorningCheck(state: RedFlagState, check: MorningCheck): RedFlagState {
  if (check.redFlags.length === 0) return state
  const items = Array.from(new Set([...(state.active ? state.items : []), ...check.redFlags]))
  return { active: true, since: state.active && state.since ? state.since : check.date, items }
}

/** Clearing takes a note; an empty note is refused. */
export function clearRedFlag(state: RedFlagState, note: string, date: IsoDate): RedFlagState {
  if (note.trim().length === 0) throw new Error('clearing the red-flag state needs a note')
  if (!state.active) return state
  return { active: false, items: [], clearedOn: date, clearNote: note.trim() }
}

export function progressionSuspended(state: RedFlagState): boolean {
  return state.active
}

/** The Today screen's stop message with the flagged items spelled out. */
export function stopMessage(state: RedFlagState, catalog: readonly RedFlag[]): { headline: string; items: string[] } | null {
  if (!state.active) return null
  const byId = new Map(catalog.map((f) => [f.id, f.text]))
  return { headline: STOP_HEADLINE, items: state.items.map((id) => byId.get(id) ?? id) }
}
