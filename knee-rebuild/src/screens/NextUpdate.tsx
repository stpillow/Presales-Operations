import { useState } from 'react'
import { navigate } from '../app/router.ts'
import { PROGRAM } from '../app/session.ts'
import { Button } from '../components/Button.tsx'
import { Screen } from '../components/Screen.tsx'
import { useLocations } from '../db/hooks.ts'
import { forNextProgramUpdate } from '../rules/equipment.ts'
import { copiedWords, copyText, updateLead, updateLine } from './NextUpdate.helpers.ts'

const TITLE = 'For the next program update'

/**
 * `#/next-update`, from More (design section 6): what the gyms have that the program doesn't use,
 * typed text with its gym and day and list items no session uses, archived gyms included
 * (`forNextProgramUpdate`), and "Copy as text". Nothing here changes a session.
 */
export function NextUpdate() {
  const locations = useLocations()
  const [copied, setCopied] = useState<{ ok: boolean; count: number } | null>(null)

  if (locations === undefined) {
    return (
      <Screen title={TITLE} lead="Opening storage…">
        <p className="text-body text-on-dark-dim">The gyms load from the phone.</p>
      </Screen>
    )
  }

  const notes = forNextProgramUpdate(locations, PROGRAM.equipment, PROGRAM.exercises)
  const text = copyText(notes)

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setCopied({ ok: true, count: notes.length })
    } catch {
      // iOS refuses the clipboard outside a secure context or a tap it trusts; the text is shown to select instead.
      setCopied({ ok: false, count: notes.length })
    }
  }

  return (
    <Screen title={TITLE} lead={updateLead(notes.length)}>
      {notes.length > 0 ? (
        <>
          <ul aria-label="Kept for the next program update" className="flex flex-col gap-3">
            {notes.map((note, i) => {
              const line = updateLine(note)
              return (
                <li key={`${note.locationName}-${note.text}-${i}`} className="flex flex-col gap-1 border-t border-on-dark-faint pt-3">
                  <span className="text-body text-on-dark wrap-anywhere">{line.what}</span>
                  <span className="text-small text-on-dark-muted wrap-anywhere">{line.detail}</span>
                </li>
              )
            })}
          </ul>
          <Button variant="primary" wide onClick={() => void copy()}>
            Copy as text
          </Button>
          {copied ? (
            <p role="status" className="text-body text-on-dark">
              {copiedWords(copied.ok, copied.count)}
            </p>
          ) : null}
          {copied && !copied.ok ? (
            <textarea
              readOnly
              aria-label="The list as text"
              rows={Math.min(12, notes.length + 2)}
              value={text}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-sm bg-ink p-3 font-mono text-small text-on-dark"
            />
          ) : null}
        </>
      ) : null}
      <Button variant="quiet" wide onClick={() => navigate({ name: 'locations' })}>
        Where you train
      </Button>
    </Screen>
  )
}
