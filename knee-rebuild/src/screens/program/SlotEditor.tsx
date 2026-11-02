import { useEffect, useId, useRef, useState } from 'react'
import { PROGRAM } from '../../app/session.ts'
import { Button } from '../../components/Button.tsx'
import { clearProgramOverride, saveProgramOverride } from '../../db/repo.ts'
import { cleanCue, cueProblem, insertItem, moveItem, overrideFor, removeItem, replaceItem, withCueAdded, withSubstitutionAdded, type SlotEdit } from '../../rules/overrides.ts'
import type { IsoDate, ProgramOverride, Slot } from '../../schema/index.ts'
import { failedWords } from '../Locations.helpers.ts'
import { RESET_ASK, SUBSTITUTION_ORDER_NOTE, addSections, cueCountWords, editorView, exerciseName, removedWords } from '../Program.helpers.ts'
import { Group, LABEL, Note, Problem, RowButton, useFlash } from './parts.tsx'

type Part = 'cues' | 'substitutions' | 'reset'
type Removed = { kind: 'cue' | 'substitution'; index: number; value: string; words: string }

const STILL = 'the slot shows what the phone still has.'
const sameEdit = (a: SlotEdit, b: SlotEdit) => JSON.stringify(a) === JSON.stringify(b)

/**
 * One slot's editor, inline under it (no modal): its cues (reword, add, remove, reorder) and its
 * substitutions (reorder, remove, add from the catalog). Every change saves at once as the slot's
 * override (`overrideFor` decides the row, or that the row goes); a draft sits in front of the
 * stored lists so two quick taps build on each other. "Back to program.md's" clears the slot's row.
 */
export function SlotEditor({ slot, override, today }: { slot: Slot; override: ProgramOverride | undefined; today: IsoDate }) {
  const view = editorView(slot, override)
  const stored = view.edit
  const storedKey = JSON.stringify(stored)
  const storedRef = useRef(stored)
  storedRef.current = stored
  const [draft, setDraft] = useState<SlotEdit>(stored)
  const latest = useRef<SlotEdit>(stored)
  const pending = useRef(0)
  const [saved, flash] = useFlash<Part>()
  const [problem, setProblem] = useState<{ part: Part; text: string } | null>(null)
  const [removed, setRemoved] = useState<Removed | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  // The stored lists win once no write is in flight: an edit saved, reset, or made elsewhere.
  useEffect(() => {
    if (pending.current === 0) {
      latest.current = storedRef.current
      setDraft(storedRef.current)
    }
  }, [storedKey])

  /** Saves the next lists as the slot's override (or clears it when they are program.md's); a failure says so and puts the stored lists back. */
  const write = async (part: Part, next: SlotEdit): Promise<boolean> => {
    if (sameEdit(next, latest.current)) return true
    latest.current = next
    setDraft(next)
    setProblem(null)
    pending.current += 1
    try {
      const row = overrideFor(slot, next, today)
      if (row) await saveProgramOverride(row, PROGRAM)
      else await clearProgramOverride(slot.id)
      flash(part)
      return true
    } catch (e: unknown) {
      setProblem({ part, text: failedWords('That edit', e, STILL) })
      if (pending.current === 1) {
        latest.current = storedRef.current
        setDraft(storedRef.current)
      }
      return false
    } finally {
      pending.current -= 1
    }
  }

  const remove = async (kind: Removed['kind'], index: number) => {
    const list = kind === 'cue' ? latest.current.cues : latest.current.substitutionIds
    const value = list[index]
    if (value === undefined) return
    const next = kind === 'cue' ? { ...latest.current, cues: removeItem(list, index) } : { ...latest.current, substitutionIds: removeItem(list, index) }
    setAdded(null)
    if (await write(kind === 'cue' ? 'cues' : 'substitutions', next)) {
      setRemoved({ kind, index, value, words: removedWords(kind, kind === 'cue' ? value : exerciseName(value)) })
    }
  }

  const putBack = async () => {
    if (!removed) return
    const { kind, index, value } = removed
    setRemoved(null)
    if (kind === 'cue') await write('cues', { ...latest.current, cues: insertItem(latest.current.cues, index, value) })
    else if (!latest.current.substitutionIds.includes(value)) await write('substitutions', { ...latest.current, substitutionIds: insertItem(latest.current.substitutionIds, index, value) })
  }

  const reset = async () => {
    setProblem(null)
    setRemoved(null)
    setAdded(null)
    pending.current += 1
    try {
      await clearProgramOverride(slot.id)
      const written = { cues: [...slot.cues], substitutionIds: [...slot.substitutionIds] }
      latest.current = written
      setDraft(written)
      setAsking(false)
      flash('reset')
    } catch (e: unknown) {
      setProblem({ part: 'reset', text: failedWords('Back to program.md’s', e, STILL) })
    } finally {
      pending.current -= 1
    }
  }

  const problemFor = (part: Part) => (problem?.part === part ? <Problem>{problem.text}</Problem> : null)
  const isEdited = view.edited.cues || view.edited.substitutions
  const sections = addSections(slot, draft, PROGRAM.exercises)

  return (
    <div className="flex flex-col gap-6 rounded-sm border border-on-dark-faint p-4">
      {view.detail ? <p className="text-body text-on-dark wrap-anywhere">{view.detail}</p> : <p className="text-body text-on-dark-dim">As program.md writes it. Each change saves at once.</p>}

      {removed ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-body text-on-dark wrap-anywhere">
            {removed.words}
          </p>
          <Button wide onClick={() => void putBack()}>
            Put it back
          </Button>
        </div>
      ) : null}

      <Group label="Cues" saved={saved === 'cues'}>
        {draft.cues.length === 0 ? <Note>No cues. Add one below, or go back to program.md’s.</Note> : null}
        <ol className="flex flex-col gap-4">
          {draft.cues.map((cue, i) => (
            <CueRow
              key={`${i}:${cue}`}
              index={i}
              count={draft.cues.length}
              cue={cue}
              onReword={(text) => void write('cues', { ...latest.current, cues: replaceItem(latest.current.cues, i, cleanCue(text)) })}
              onMove={(by) => void write('cues', { ...latest.current, cues: moveItem(latest.current.cues, i, by) })}
              onRemove={() => void remove('cue', i)}
            />
          ))}
        </ol>
        <AddCue onAdd={(text) => write('cues', withCueAdded(latest.current, text))} />
        {problemFor('cues')}
        {view.writtenCues ? <Written heading="program.md’s cues" items={view.writtenCues} empty="program.md writes no cues for this slot." /> : null}
      </Group>

      <Group label="Substitutions, in order" saved={saved === 'substitutions'}>
        {draft.substitutionIds.length === 0 ? <Note>None. With none, nothing stands in when the gym lacks this exercise, and a back-off on bodyweight work drops a set instead.</Note> : null}
        <ol className="flex flex-col gap-3">
          {draft.substitutionIds.map((id, i) => {
            const name = exerciseName(id)
            return (
              <li key={id} className="flex flex-col gap-2">
                <p className="text-body text-on-dark wrap-anywhere">
                  <span className="font-mono text-small text-on-dark-muted">{i + 1}.</span> {name}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <RowButton aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => void write('substitutions', { ...latest.current, substitutionIds: moveItem(latest.current.substitutionIds, i, -1) })}>
                    Up
                  </RowButton>
                  <RowButton
                    aria-label={`Move ${name} down`}
                    disabled={i === draft.substitutionIds.length - 1}
                    onClick={() => void write('substitutions', { ...latest.current, substitutionIds: moveItem(latest.current.substitutionIds, i, 1) })}
                  >
                    Down
                  </RowButton>
                  <RowButton aria-label={`Remove ${name}`} onClick={() => void remove('substitution', i)}>
                    Remove
                  </RowButton>
                </div>
              </li>
            )
          })}
        </ol>
        <Note>{SUBSTITUTION_ORDER_NOTE}</Note>
        {added ? (
          <p role="status" className="text-body text-on-dark wrap-anywhere">
            {added}
          </p>
        ) : null}
        <AddSubstitution
          sections={sections}
          onAdd={async (id) => {
            setRemoved(null)
            if (await write('substitutions', withSubstitutionAdded(slot, latest.current, id))) setAdded(`Added ${exerciseName(id)} at the end of the substitutions.`)
          }}
        />
        {problemFor('substitutions')}
        {view.writtenSubstitutions ? <Written heading="program.md’s order" items={view.writtenSubstitutions} empty="program.md writes no substitutions for this slot." /> : null}
      </Group>

      {isEdited || saved === 'reset' ? (
        <div className="flex flex-col gap-2 border-t border-on-dark-faint pt-4">
          <span role="status" aria-live="polite" className="font-mono text-small uppercase tracking-[0.22em] text-green-bright">
            {saved === 'reset' ? '✓ Back to program.md’s' : ''}
          </span>
          {isEdited && asking ? (
            <>
              <p className="text-body text-on-dark">{RESET_ASK}</p>
              <Button variant="primary" wide onClick={() => void reset()}>
                Yes, back to program.md’s
              </Button>
              <Button variant="quiet" wide onClick={() => setAsking(false)}>
                Keep my edits
              </Button>
            </>
          ) : isEdited ? (
            <Button wide onClick={() => setAsking(true)}>
              Back to program.md’s
            </Button>
          ) : null}
          {problemFor('reset')}
        </div>
      ) : null}
    </div>
  )
}

/** One cue: reworded in place (saved when the field is left or Return is pressed), moved, or removed. */
function CueRow({ index, count, cue, onReword, onMove, onRemove }: { index: number; count: number; cue: string; onReword: (text: string) => void; onMove: (by: -1 | 1) => void; onRemove: () => void }) {
  const id = useId()
  const [text, setText] = useState(cue)
  const [refusal, setRefusal] = useState<string | null>(null)
  const commit = () => {
    if (cleanCue(text) === cue) {
      setText(cue)
      setRefusal(null)
      return
    }
    const problem = cueProblem(text)
    if (problem) {
      setRefusal(`${problem} Cue ${index + 1} is kept as it was until it fits.`)
      return
    }
    setRefusal(null)
    onReword(text)
  }
  const count200 = cueCountWords(text)
  return (
    <li className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        Cue {index + 1}
      </label>
      <textarea
        id={id}
        rows={3}
        value={text}
        enterKeyHint="done"
        onChange={(e) => {
          setText(e.target.value)
          setRefusal(null)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          // A cue is one line: Return saves it.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className="tap w-full resize-y rounded-sm bg-ink px-3 py-2 text-body text-on-dark"
      />
      {count200 ? <Note>{count200}</Note> : null}
      {refusal ? <Problem>{refusal}</Problem> : null}
      <div className="grid grid-cols-3 gap-2">
        <RowButton aria-label={`Move cue ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          Up
        </RowButton>
        <RowButton aria-label={`Move cue ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
          Down
        </RowButton>
        <RowButton aria-label={`Remove cue ${index + 1}`} onClick={onRemove}>
          Remove
        </RowButton>
      </div>
    </li>
  )
}

/** A new cue at the end of the list; refused in words when it is empty or over 200 characters. */
function AddCue({ onAdd }: { onAdd: (text: string) => Promise<boolean> }) {
  const id = useId()
  const [text, setText] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const problem = cueProblem(text)
    if (problem) {
      setRefusal(problem)
      return
    }
    setBusy(true)
    const submitted = text
    const ok = await onAdd(submitted)
    setBusy(false)
    // The field empties only if it still holds what was added, so text typed meanwhile stays.
    if (ok) setText((t) => (t === submitted ? '' : t))
  }
  const count200 = cueCountWords(text)
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <label htmlFor={id} className="text-body text-on-dark-dim">
        A new cue, in your words
      </label>
      <textarea
        id={id}
        rows={2}
        value={text}
        enterKeyHint="done"
        onChange={(e) => {
          setText(e.target.value)
          setRefusal(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void add()
          }
        }}
        className="tap w-full resize-y rounded-sm bg-ink px-3 py-2 text-body text-on-dark"
      />
      {count200 ? <Note>{count200}</Note> : null}
      {refusal ? <Problem>{refusal}</Problem> : null}
      <Button type="submit" wide disabled={busy}>
        Add cue
      </Button>
    </form>
  )
}

/** Add from the catalog: the slot's own pattern open, every other exercise behind one tap. Never a new exercise. */
function AddSubstitution({ sections, onAdd }: { sections: ReturnType<typeof addSections>; onAdd: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const add = async (id: string) => {
    setBusy(true)
    await onAdd(id)
    setBusy(false)
  }
  if (!open) {
    return (
      <Button wide aria-expanded={false} onClick={() => setOpen(true)}>
        Add a substitution
      </Button>
    )
  }
  const pick = (exercises: { id: string; name: string }[]) => (
    <ul className="flex flex-col gap-2">
      {exercises.map((e) => (
        <li key={e.id}>
          <Button wide className="text-left wrap-anywhere" disabled={busy} aria-label={`Add ${e.name}`} onClick={() => void add(e.id)}>
            {e.name}
          </Button>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="flex flex-col gap-3">
      <Button variant="quiet" wide aria-expanded onClick={() => setOpen(false)}>
        Close the catalog
      </Button>
      <h5 className={LABEL}>{sections.same.heading}</h5>
      {sections.same.exercises.length > 0 ? pick(sections.same.exercises) : <Note>Every exercise of this pattern is on the list already.</Note>}
      {all ? (
        sections.others.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2">
            <h5 className={LABEL}>{group.heading}</h5>
            {pick(group.exercises)}
          </div>
        ))
      ) : sections.otherCount > 0 ? (
        <Button variant="quiet" wide aria-expanded={false} onClick={() => setAll(true)}>
          Show the other {sections.otherCount} exercises
        </Button>
      ) : null}
    </div>
  )
}

/** program.md's own list, beside an edited one. */
function Written({ heading, items, empty }: { heading: string; items: readonly string[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1 border-l border-on-dark-faint pl-3">
      <h5 className={LABEL}>{heading}</h5>
      {items.length === 0 ? (
        <Note>{empty}</Note>
      ) : (
        <ol className="flex flex-col gap-1 text-small text-on-dark-muted">
          {items.map((item, i) => (
            <li key={`${i}:${item}`} className="wrap-anywhere">
              {i + 1}. {item}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
