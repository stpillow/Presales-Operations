import type { Candidate } from '../rules/stravaImport.ts'
import { milesWords, timeWords } from './RunLogger.helpers.ts'
import { runLabel, shortDateWords } from './Today.helpers.ts'

/** What came back from Strava's consent page, in words (the function's `?result=`). */
export function resultWords(result: string | undefined): string | null {
  switch (result) {
    case undefined:
      return null
    case 'connected':
      return 'Connected to Strava.'
    case 'denied':
      return 'Strava was not connected: the consent page was declined.'
    case 'scope':
      return 'Strava was not connected: reading your activities was left unticked, and the import needs it. Connect again and leave it ticked.'
    case 'state':
      return 'Strava was not connected: the sign-in came back without the check this app sent. Connect again from this screen.'
    default:
      return 'Strava was not connected: it would not hand over access. Try again in a minute.'
  }
}

/** "Max pain and effort to fill in", the fields only Shawn can give. */
export function needsWords(needs: readonly string[]): string {
  if (needs.length === 0) return 'Nothing to fill in.'
  const [first, ...rest] = needs
  const list = rest.length === 0 ? first : `${needs.slice(0, -1).join(', ')} and ${needs.at(-1)}`
  return `${list!.charAt(0).toUpperCase()}${list!.slice(1)} to fill in before it saves.`
}

/** One line for an activity: its day, its name, and what it would log as. */
export function candidateWords(c: Candidate): { title: string; detail: string } {
  switch (c.kind) {
    case 'run': {
      const d = c.draft
      const what = d.miles > 0 ? `${runLabel(d.type)}, ${milesWords(d.miles)}, ${timeWords(d.minutes)}` : `${runLabel(d.type)}, ${timeWords(d.minutes)}`
      return { title: `${shortDateWords(d.date)} · ${d.notes || 'Strava activity'}`, detail: `${what}. ${needsWords(c.needs)}` }
    }
    case 'lift':
      return { title: `${shortDateWords(c.date)} · ${c.name}`, detail: 'A strength session: log it from that day’s preview, with its sets.' }
    case 'skip':
      return { title: `${shortDateWords(c.date)} · ${c.name}`, detail: `Left out. ${c.reason}` }
  }
}
