import { useEffect, useRef, useState } from 'react'
import { navigate } from '../app/router.ts'
import { PROGRAM } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { Screen } from '../components/Screen.tsx'
import { Stepper } from '../components/Stepper.tsx'
import { Tap } from '../components/Tap.tsx'
import { useHistory, useSettings } from '../db/hooks.ts'
import { addGateTest, saveSettings, type History } from '../db/repo.ts'
import { weekOf } from '../rules/calendar.ts'
import { advancePhase } from '../rules/progress.ts'
import type { GateItem, IsoDate, Settings } from '../schema/index.ts'
import {
  advanceErrorSentence,
  advancedWords,
  bestWords,
  buildTest,
  formBest,
  formBlocker,
  gatesView,
  manualTest,
  newGateTestId,
  openForm,
  setValue,
  symmetryLine,
  testErrorSentence,
  tickErrorSentence,
  withoutKey,
  type GatesView,
  type ItemView,
  type SymmetryEntry,
  type SymmetryForm,
  type Trial,
} from './Gates.helpers.ts'

const TITLE = 'Gates'
const LABEL = 'font-mono text-small font-normal uppercase tracking-[0.22em] text-on-dark-muted'
const HEADING = 'font-sans text-h3 font-medium text-on-dark'
const SECTION = 'flex flex-col gap-3'
/** Generous ceilings: a triple hop runs past 200 in., a single-leg press stack past 300 lb. */
const MAX_INCHES = 600
const MAX_LOAD = 1000

type GateBody = Extract<GatesView, { kind: 'gate' }>
type Side = 'injured' | 'other'
type Pending = { kind: 'tick'; itemId: string; value: boolean } | { kind: 'test'; itemId: string } | { kind: 'advance' }

/**
 * The gate out of the current phase: each item evaluated live from what is logged, manual items as
 * toggles, symmetry tests entered inline, and an Advance phase button that waits for every item and
 * for Shawn's yes. Every verdict comes from src/rules through gatesView; this file renders and writes.
 */
export function Gates() {
  const today = useToday()
  const settings = useSettings()
  const history = useHistory()

  if (settings === undefined || history === undefined) {
    return (
      <Screen title={TITLE} lead="Opening storage…">
        <p className="text-body text-on-dark-dim">Reading the sessions, runs, morning checks and tests logged on this phone.</p>
      </Screen>
    )
  }
  if (settings === null) {
    return (
      <Screen title={TITLE} lead="No settings yet.">
        <p className="text-body text-on-dark-dim">The current phase and the injured side live in Settings.</p>
        <Button wide onClick={() => navigate({ name: 'settings' })}>
          Settings
        </Button>
      </Screen>
    )
  }
  return <GateScreen today={today} settings={settings} history={history} />
}

function GateScreen({ today, settings, history }: { today: IsoDate; settings: Settings; history: History }) {
  /** Symmetry forms being typed, by gate item id; an item with no draft shows its opening form. */
  const [drafts, setDrafts] = useState<Record<string, SymmetryForm>>({})
  /** The write in flight, so only the control that made it says "Saving…". */
  const [pending, setPending] = useState<Pending | null>(null)
  /** A refused write, one sentence, by gate item id or "advance". */
  const [errors, setErrors] = useState<Record<string, string>>({})
  /** The last saved test's line, by gate item id, until its form is touched again. */
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [advanced, setAdvanced] = useState<string | null>(null)

  // Yes, advance sits at the foot of a long page and the new gate's checklist replaces everything
  // above it: bring the top into view, where the new gate's title and the line saying what changed are.
  useEffect(() => {
    if (advanced !== null) window.scrollTo({ top: 0 })
  }, [advanced])

  const view = gatesView({ today, settings, history, program: PROGRAM })
  const takenIds = history.gateTests.map((t) => t.id)
  const setError = (key: string, text: string | null) => setErrors((all) => (text === null ? withoutKey(all, key) : { ...all, [key]: text }))

  if (view.kind === 'no-gate') {
    return (
      <Screen title={TITLE} lead={view.line}>
        {advanced ? (
          <p role="status" className="text-body text-on-dark">
            {advanced}
          </p>
        ) : null}
        <p className="text-body text-on-dark-dim">No gate leads out of Phase {settings.currentPhase} yet, so there is nothing to check here.</p>
        <Button wide onClick={() => navigate({ name: 'today' })}>
          Today
        </Button>
      </Screen>
    )
  }

  const { gate } = view

  async function tick(item: GateItem, value: boolean) {
    if (pending) return
    // new Date() only stamps the id, so two ticks on one day keep the order they were made in.
    const test = manualTest({ gate, item, pass: value, today, id: newGateTestId(new Date().toISOString(), item.id, takenIds) })
    setPending({ kind: 'tick', itemId: item.id, value })
    setError(item.id, null)
    // The checklist changed under an open confirm: close it, so a yes is always given to the gate as it now reads.
    setConfirming(false)
    try {
      await addGateTest(test)
    } catch (e: unknown) {
      setError(item.id, tickErrorSentence(e))
    } finally {
      setPending(null)
    }
  }

  const formFor = (itemId: string, entry: SymmetryEntry): SymmetryForm => drafts[itemId] ?? openForm(entry.trials, entry.prefill)

  function edit(itemId: string, entry: SymmetryEntry, side: Side, index: number, value: Trial) {
    setDrafts((all) => ({ ...all, [itemId]: setValue(all[itemId] ?? openForm(entry.trials, entry.prefill), side, index, value) }))
    setSaved((all) => withoutKey(all, itemId))
  }

  async function saveTest(item: GateItem, entry: SymmetryEntry) {
    if (pending) return
    const form = formFor(item.id, entry)
    const draft = buildTest({ gate, item, form, today, id: newGateTestId(new Date().toISOString(), entry.key ?? item.id, takenIds) })
    if (!draft.ok) return
    setPending({ kind: 'test', itemId: item.id })
    setError(item.id, null)
    setConfirming(false)
    try {
      await addGateTest(draft.test)
      setDrafts((all) => withoutKey(all, item.id))
      setSaved((all) => ({ ...all, [item.id]: `Saved. ${symmetryLine(formBest(form), entry.threshold)}` }))
    } catch (e: unknown) {
      setError(item.id, testErrorSentence(e))
    } finally {
      setPending(null)
    }
  }

  async function advance(body: GateBody) {
    if (pending || !body.advance.enabled) return
    setPending({ kind: 'advance' })
    setError('advance', null)
    try {
      // advancePhase refuses a gate that doesn't pass or doesn't lead to the next phase; the refusal is shown in words.
      const next = advancePhase(settings, body.gate, body.result.passes, weekOf(today, settings.startDate))
      await saveSettings(next)
      setConfirming(false)
      setDrafts({})
      setSaved({})
      setAdvanced(advancedWords(next, PROGRAM.phases))
    } catch (e: unknown) {
      setError('advance', advanceErrorSentence(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <Screen title={TITLE} lead={gate.title}>
      {advanced ? (
        <p role="status" className="text-body text-on-dark">
          {advanced}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-lead text-on-dark">
        {view.countLine}
      </p>

      {view.stop ? (
        <section aria-label="Red flag" className="flex flex-col gap-2 rounded-sm border border-on-dark-faint p-4">
          <p className="text-body font-medium text-on-dark">{view.stop.headline}</p>
          <ul className="flex list-disc flex-col gap-1 pl-6">
            {view.stop.items.map((item) => (
              <li key={item} className="text-small text-on-dark-dim">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-small text-on-dark-dim">The gate is checked as usual, but the phase can’t advance until the red-flag state is cleared in Settings, with a note.</p>
        </section>
      ) : null}

      <section aria-label="Checklist" className={SECTION}>
        <h2 className={HEADING}>Checklist</h2>
        <ol className="flex flex-col">
          {view.items.map((row) => (
            <ItemRow
              key={row.item.id}
              row={row}
              pending={pending}
              error={errors[row.item.id] ?? null}
              saved={saved[row.item.id] ?? null}
              form={row.kind === 'symmetry' ? formFor(row.item.id, row.entry) : null}
              onTick={(value) => void tick(row.item, value)}
              onEdit={(side, index, value) => {
                if (row.kind === 'symmetry') edit(row.item.id, row.entry, side, index, value)
              }}
              onSave={() => {
                if (row.kind === 'symmetry') void saveTest(row.item, row.entry)
              }}
            />
          ))}
        </ol>
      </section>

      <AdvanceBlock
        body={view}
        confirming={confirming && view.advance.enabled}
        saving={pending?.kind === 'advance'}
        busy={pending !== null}
        error={errors.advance ?? null}
        onAsk={() => {
          setError('advance', null)
          setConfirming(true)
        }}
        onCancel={() => setConfirming(false)}
        onYes={() => void advance(view)}
      />
    </Screen>
  )
}

function ItemRow({
  row,
  pending,
  error,
  saved,
  form,
  onTick,
  onEdit,
  onSave,
}: {
  row: ItemView
  pending: Pending | null
  error: string | null
  saved: string | null
  form: SymmetryForm | null
  onTick: (value: boolean) => void
  onEdit: (side: Side, index: number, value: Trial) => void
  onSave: () => void
}) {
  const ticking = pending?.kind === 'tick' && pending.itemId === row.item.id ? pending : null
  return (
    <li className="flex flex-col gap-3 border-t border-on-dark-faint py-4">
      <span className={`inline-flex items-center gap-2 font-mono text-small uppercase tracking-[0.22em] ${row.pass ? 'text-on-dark' : 'text-on-dark-muted'}`}>
        <span aria-hidden="true">{row.mark}</span>
        {row.word}
      </span>
      {row.kind === 'manual' ? (
        // The item text is long, so the Tap's state word ("○ Not yet") wrapped onto two or three lines at
        // phone width; keep it on one line and let the item text wrap instead.
        <div className="[&_button>span+span]:whitespace-nowrap">
          <Tap label={row.item.text} value={ticking ? ticking.value : row.pass} onChange={onTick} yes="Done" no="Not yet" />
        </div>
      ) : (
        <p className="text-body text-on-dark">{row.item.text}</p>
      )}
      <p className="text-small text-on-dark-dim">{row.detail}</p>
      {ticking ? <p className="text-small text-on-dark-muted">Saving…</p> : null}
      {error ? (
        <p role="alert" className="text-body text-on-dark">
          {error}
        </p>
      ) : null}
      {row.kind === 'symmetry' && form ? (
        <SymmetryBlock entry={row.entry} form={form} saving={pending?.kind === 'test' && pending.itemId === row.item.id} busy={pending !== null} saved={saved} onEdit={onEdit} onSave={onSave} />
      ) : null}
    </li>
  )
}

/** The inline entry form: trials or one value per side, the best kept, the symmetry live against the line, and the tests so far. */
function SymmetryBlock({
  entry,
  form,
  saving,
  busy,
  saved,
  onEdit,
  onSave,
}: {
  entry: SymmetryEntry
  form: SymmetryForm
  saving: boolean
  busy: boolean
  saved: string | null
  onEdit: (side: Side, index: number, value: Trial) => void
  onSave: () => void
}) {
  const best = formBest(form)
  const blocker = entry.key === null ? 'This item has no test key in the program data' : formBlocker(form, entry.trials)
  return (
    <div className="flex flex-col gap-4 border-l-2 border-on-dark-faint pl-3">
      <p className="text-small text-on-dark-muted">
        {entry.trials !== null
          ? `Up to ${entry.trials} trials per side, in inches; the best of each side counts, and one trial a side is enough to save. A hop you couldn’t do is 0; a trial left not entered doesn’t count.`
          : entry.prefillLine}
      </p>
      <SideFields label={entry.sides.injured} side="injured" values={form.injured} best={best.injured} entry={entry} onEdit={onEdit} />
      <SideFields label={entry.sides.other} side="other" values={form.other} best={best.other} entry={entry} onEdit={onEdit} />
      <p role="status" aria-live="polite" className="text-body text-on-dark">
        {symmetryLine(best, entry.threshold)}
      </p>
      <Button wide disabled={blocker !== null || busy} onClick={onSave}>
        {saving ? 'Saving…' : (blocker ?? 'Save this test')}
      </Button>
      {saved ? (
        <p role="status" className="text-body text-on-dark">
          {saved}
        </p>
      ) : null}
      <EarlierTests entry={entry} />
    </div>
  )
}

function SideFields({
  label,
  side,
  values,
  best,
  entry,
  onEdit,
}: {
  label: string
  side: Side
  values: Trial[]
  best: number | null
  entry: SymmetryEntry
  onEdit: (side: Side, index: number, value: Trial) => void
}) {
  if (entry.trials === null) {
    return <Stepper label={label} unit={entry.unit} decimal step={entry.step} min={0} max={MAX_LOAD} value={values[0] ?? 0} onChange={(n) => onEdit(side, 0, n)} />
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${LABEL} pb-2`}>{label}</legend>
      {values.map((value, i) => (
        <TrialField key={i} label={`Trial ${i + 1}`} unit={entry.unit} step={entry.step} value={value} onChange={(v) => onEdit(side, i, v)} />
      ))}
      <p className="text-body text-on-dark-dim">{bestWords(best, entry.unit)}</p>
    </fieldset>
  )
}

/**
 * One hop trial. The Stepper can only hold a number, and 0 is a trial (a hop he couldn't do), so a
 * trial starts as the words "Not entered" with an Enter button that puts it at 0; Clear takes it back.
 */
function TrialField({ label, unit, step, value, onChange }: { label: string; unit: string; step: number; value: Trial; onChange: (value: Trial) => void }) {
  // Enter and Clear each remove the button just tapped, so focus moves on to what replaced it (the
  // new field, or Enter again) instead of falling to the page and losing a VoiceOver user's place.
  const box = useRef<HTMLDivElement>(null)
  const moveFocus = useRef<'input' | 'button' | null>(null)
  useEffect(() => {
    const target = moveFocus.current
    if (!target) return
    moveFocus.current = null
    box.current?.querySelector<HTMLElement>(target)?.focus()
  }, [value === null])
  const enter = () => {
    moveFocus.current = 'input'
    onChange(0)
  }
  const clear = () => {
    moveFocus.current = 'button'
    onChange(null)
  }
  return <div ref={box}>{value === null ? <EmptyTrial label={label} unit={unit} onEnter={enter} /> : <FilledTrial label={label} unit={unit} step={step} value={value} onChange={onChange} onClear={clear} />}</div>
}

function EmptyTrial({ label, unit, onEnter }: { label: string; unit: string; onEnter: () => void }) {
  {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-body text-on-dark-dim">
          {label}
          <span className="text-on-dark-muted"> ({unit})</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-small text-on-dark-muted">Not entered</span>
          <Button aria-label={`Enter ${label.toLowerCase()}, starting at 0`} onClick={onEnter}>
            Enter
          </Button>
        </div>
      </div>
    )
  }
}

function FilledTrial({ label, unit, step, value, onChange, onClear }: { label: string; unit: string; step: number; value: number; onChange: (value: Trial) => void; onClear: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Stepper label={label} unit={unit} decimal step={step} min={0} max={MAX_INCHES} value={value} onChange={onChange} />
      <Button variant="quiet" className="self-end" aria-label={`Clear ${label.toLowerCase()}: back to not entered`} onClick={onClear}>
        Clear
      </Button>
    </div>
  )
}

function EarlierTests({ entry }: { entry: SymmetryEntry }) {
  if (entry.earlier.length === 0) return <p className="text-small text-on-dark-muted">No tests saved for this item yet.</p>
  return (
    <div className="flex flex-col gap-1">
      <h3 className={LABEL}>Earlier tests</h3>
      <ul className="flex flex-col">
        {entry.earlier.map((t) => (
          <li key={t.id} className="flex flex-col border-t border-on-dark-faint py-2 first:border-t-0">
            <span className="text-small text-on-dark">
              {t.when} · {t.percent}
            </span>
            <span className="text-small text-on-dark-dim">
              {t.values} · {t.word}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AdvanceBlock({
  body,
  confirming,
  saving,
  busy,
  error,
  onAsk,
  onCancel,
  onYes,
}: {
  body: GateBody
  confirming: boolean
  saving: boolean
  busy: boolean
  error: string | null
  onAsk: () => void
  onCancel: () => void
  onYes: () => void
}) {
  // The confirm replaces the button just tapped: focus goes to its question, and back to Advance
  // phase when it closes, so a VoiceOver user is never left on nothing.
  const box = useRef<HTMLElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (confirming) {
      opened.current = true
      box.current?.querySelector<HTMLElement>('[data-confirm-question]')?.focus()
    } else if (opened.current) {
      opened.current = false
      box.current?.querySelector<HTMLElement>('button')?.focus()
    }
  }, [confirming])
  return (
    <section ref={box} aria-label="Advance phase" className={SECTION}>
      <h2 className={HEADING}>Advance phase</h2>
      <p className="text-small text-on-dark-muted">The phase never advances on its own: every item has to pass, then you say yes.</p>
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-sm border border-paper p-4">
          <p data-confirm-question tabIndex={-1} className="text-body text-on-dark">
            {body.question}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" disabled={busy} onClick={onYes}>
              {saving ? 'Saving…' : 'Yes, advance'}
            </Button>
            <Button variant="quiet" disabled={saving} onClick={onCancel}>
              Not yet
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" wide disabled={!body.advance.enabled || busy} onClick={onAsk}>
          <span className="block">Advance phase</span>
          {body.advance.enabled ? null : <span className="block text-small">{body.advance.why}</span>}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-body text-on-dark">
          {error}
        </p>
      ) : null}
    </section>
  )
}
