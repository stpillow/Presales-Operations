import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { overridesBySlot } from '../../rules/overrides.ts'
import type { IsoDate, ProgramOverride } from '../../schema/index.ts'
import type { PhaseScreen, SlotRow } from '../Program.helpers.ts'
import { HEADING, LABEL, Note } from './parts.tsx'
import { SlotEditor } from './SlotEditor.tsx'

/** The current phase's sessions, A then B then C, each slot read-only with an Edit that opens its editor in place. */
export function PhaseSessions({ screen, overrides, today }: { screen: PhaseScreen; overrides: readonly ProgramOverride[]; today: IsoDate }) {
  // One editor open at a time; leaving a cue's field saves it, so opening another loses nothing.
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

function SlotCard({ row, override, today, open, onToggle }: { row: SlotRow; override: ProgramOverride | undefined; today: IsoDate; open: boolean; onToggle: () => void }) {
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

      {open ? <SlotEditor slot={row.slot} override={override} today={today} /> : null}
      {/* One button under the slot or its editor, the same element either way, so focus stays on it. */}
      <Button wide aria-expanded={open} aria-label={`${open ? 'Done editing' : 'Edit cues and substitutions for'} ${row.exerciseName}, slot ${row.label}`} onClick={onToggle}>
        {open ? 'Done editing' : 'Edit cues and substitutions'}
      </Button>
    </li>
  )
}
