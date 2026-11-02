import type { ProgramUpdateNote } from '../rules/equipment.ts'
import { shortDate } from './LocationEditor.helpers.ts'

/*
 * For the next program update (`#/next-update`, M4b design section 6): `forNextProgramUpdate`'s
 * notes in words, and the same as plain text to copy. What goes on the list is the rule's call.
 */

export interface UpdateLine {
  /** The item, as typed or as the program's list names it. */
  what: string
  /** Where it is and why it is here: "Typed at Marriott Downtown, Nov 10". */
  detail: string
}

/** One note in words: typed text with its gym and day, or a list item the gym has that no session uses. */
export function updateLine(note: ProgramUpdateNote): UpdateLine {
  return note.addedOn
    ? { what: note.text, detail: `Typed at ${note.locationName}, ${shortDate(note.addedOn)}` }
    : { what: note.text, detail: `At ${note.locationName}: on program.md’s list, but no session uses it` }
}

export const COPY_HEADING = 'For the next program.md update'

/** "Copy as text": a heading, then one line per note, ready to paste into a note or a message. */
export function copyText(notes: readonly ProgramUpdateNote[]): string {
  const lines = notes.map(updateLine).map((l) => `- ${l.what} (${l.detail.charAt(0).toLowerCase()}${l.detail.slice(1)})`)
  return [COPY_HEADING, ...lines].join('\n')
}

/** The line over the list, or what an empty list means. */
export function updateLead(count: number): string {
  if (count === 0) return 'Nothing yet. Equipment typed in a gym’s editor that no exercise uses lands here, with the gym and the day.'
  return `${count} ${count === 1 ? 'thing' : 'things'} the gyms have that the program doesn’t use, kept for the next time program.md is updated.`
}

/** What a tap on Copy as text came to. */
export function copiedWords(ok: boolean, count: number): string {
  return ok ? `Copied ${count} ${count === 1 ? 'line' : 'lines'}.` : 'This browser didn’t allow copying; the text is below to select and copy.'
}
