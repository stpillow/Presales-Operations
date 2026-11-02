import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Button } from '../../components/Button.tsx'
import { overridesBySlot, withPutBack } from '../../rules/overrides.ts'
import type { IsoDate, ProgramOverride } from '../../schema/index.ts'
import { editorView, unaddedCueWords, type PhaseScreen, type SlotRow } from '../Program.helpers.ts'
import { keepSlotDraft, slotDraft, type SlotDraft } from './drafts.ts'
import { HEADING, LABEL, Note, Problem } from './parts.tsx'
import { SlotEditor, editFailedWords, saveSlotEdit } from './SlotEditor.tsx'

/** The current phase's sessions, A then B then C, each slot read-only with an Edit that opens its editor in place. */
export function PhaseSessions({ screen, overrides, today }: { screen: PhaseScreen; overrides: readonly ProgramOverride[]; today: IsoDate }) {
  // One editor open at a time; leaving a cue's field saves it, and a new cue not yet added stays with its slot, so opening another loses nothing.
  const [open, setOpen] = useState<string | null>(null)
  const bySlot = overridesBySlot(overrides)

  if (screen.notWritten) return <p className="text-body text-on-dark-dim">{screen.notWritten}</p>

  return (
    <div className="flex flex-col gap-10">
      {screen.sessions.map((session) => (
        <section key={session.templateId} aria-label={session.heading} className="flex flex-col gap-4">
          <h2 className={HEADING}>{session.heading}</h2>
          <ol className="flex flex-col gap-6">
            {session.rows.map((row) => (
              <SlotCard key={row.id} row={row} override={bySlot.get(row.id)} today={today} open={open === row.id} onToggle={() => setOpen((o) => (o === row.id ? null : row.id))} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

/**
 * One part of a slot's draft as state, read back from the drafts kept outside the card when it
 * mounts and kept there as it changes, so the program.md view or another tab never drops it.
 */
function useSlotDraft<K extends keyof SlotDraft>(slotId: string, part: K): [SlotDraft[K], Dispatch<SetStateAction<SlotDraft[K]>>] {
  const [value, setValue] = useState<SlotDraft[K]>(() => slotDraft(slotId)[part])
  useEffect(() => keepSlotDraft(slotId, part, value), [slotId, part, value])
  return [value, setValue]
}

function SlotCard({ row, override, today, open, onToggle }: { row: SlotRow; override: ProgramOverride | undefined; today: IsoDate; open: boolean; onToggle: () => void }) {
  // The editor's last refusal or failed save, kept under the slot once Done editing closes it (the
  // tap that closes it is often the one that left a refused field), until the editor opens again.
  const [standing, setStanding] = useSlotDraft(row.id, 'standing')
  // The new-cue field's text, kept with the slot so Done editing, another slot's Edit, the program.md
  // view or another tab before Add cue never drops it (drafts.ts).
  const [newCue, setNewCue] = useSlotDraft(row.id, 'newCue')
  // The last removal, for Put it back: in the list where it stood while the editor is open, under the slot once it closes.
  const [removed, setRemoved] = useSlotDraft(row.id, 'removed')
  const unadded = open ? null : unaddedCueWords(newCue)
  /** Put it back with the editor closed: onto the lists as stored, where it stood (`withPutBack`); a failure says so and keeps the offer. */
  const putBack = async () => {
    if (!removed) return
    const item = removed
    setRemoved(null)
    try {
      await saveSlotEdit(row.slot, withPutBack(row.slot, editorView(row.slot, override).edit, item), today)
    } catch (e: unknown) {
      setRemoved(item)
      setStanding(editFailedWords('Put it back', e))
    }
  }
  const toggle = () => {
    if (!open) setStanding(null)
    onToggle()
  }
  return (
    <li className="flex flex-col gap-3 border-t border-on-dark-faint pt-4">
      <div className="flex flex-col gap-1">
        {/* "Edited" sits beside the label in words: an edit never rides on color or a mark alone. */}
        <p className={LABEL}>
          <span>{row.label}</span>
          {row.edited ? <span className="text-on-dark"> · Edited</span> : null}
        </p>
        <h3 className="font-sans text-lead font-medium text-on-dark wrap-anywhere">{row.exerciseName}</h3>
        <p className="text-body text-on-dark-dim wrap-anywhere">{row.prescriptionText}</p>
        {row.notes.map((note) => (
          <Note key={note}>{note}</Note>
        ))}
      </div>

      {open ? null : (
        <>
          <div className="flex flex-col gap-1">
            <h4 className={LABEL}>Cues</h4>
            {row.cues.length === 0 ? (
              <Note>None.</Note>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-6 text-body text-on-dark-dim">
                {row.cues.map((cue, i) => (
                  <li key={`${i}:${cue}`} className="wrap-anywhere">
                    {cue}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h4 className={LABEL}>Substitutions, in order</h4>
            {row.substitutions.length === 0 ? (
              <Note>None.</Note>
            ) : (
              <ol className="flex list-decimal flex-col gap-1 pl-6 text-body text-on-dark-dim">
                {row.substitutions.map((name) => (
                  <li key={name} className="wrap-anywhere">
                    {name}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      {open ? (
        <SlotEditor slot={row.slot} override={override} today={today} onStanding={setStanding} newCue={newCue} onNewCue={setNewCue} removed={removed} onRemoved={setRemoved} />
      ) : null}
      {/* One button under the slot or its editor, the same element either way, so focus stays on it. */}
      <Button wide aria-expanded={open} aria-label={`${open ? 'Done editing' : 'Edit cues and substitutions for'} ${row.exerciseName}, slot ${row.label}`} onClick={toggle}>
        {open ? 'Done editing' : 'Edit cues and substitutions'}
      </Button>
      {!open && standing ? <Problem>{standing}</Problem> : null}
      {unadded ? (
        <p role="status" className="text-body text-on-dark wrap-anywhere">
          {unadded}
        </p>
      ) : null}
      {!open && removed ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-body text-on-dark wrap-anywhere">
            {removed.words}
          </p>
          <Button wide onClick={() => void putBack()}>
            Put it back
          </Button>
        </div>
      ) : null}
    </li>
  )
}
