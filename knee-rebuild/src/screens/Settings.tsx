import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PROGRAM } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { Screen } from '../components/Screen.tsx'
import { Stepper } from '../components/Stepper.tsx'
import { Tap } from '../components/Tap.tsx'
import { useSettings } from '../db/hooks.ts'
import { defaultSettings, ensureSettings, resetAll, saveSettings, saveSettingsAndMoves } from '../db/repo.ts'
import type { IsoDate, Settings as SettingsRecord } from '../schema/index.ts'
import {
  DUMBBELL_MAX,
  DUMBBELL_MIN,
  DUMBBELL_PRESETS,
  DUMBBELL_STEP,
  REST_MAX,
  REST_MIN,
  REST_STEP,
  SIDES,
  checkStartDate,
  clearedSettings,
  dateWords,
  errorWords,
  painWords,
  phaseWords,
  redFlagView,
  restTimerWords,
  sideWords,
  deloadWeeksLine,
  startDateChange,
  weekLine,
  type StartDateCheck,
} from './Settings.helpers.ts'

const TITLE = 'Settings'
const ERASED = 'Everything on this phone was erased. Settings are back to their defaults.'
const FLASH_MS = 1500

/** Which part of the screen a save, a Saved word or a problem belongs to. */
type Field = 'injuredSide' | 'startDate' | 'dumbbellMax' | 'restTimerSeconds' | 'painPerSet' | 'redFlag' | 'reset'
type Problem = { field: Field; text: string } | null
type ResetStep = 'idle' | 'confirm' | 'erasing'

/**
 * Resetting storage seeds the settings row and the home gym again in the same transaction, but if
 * the app shell swaps this screen out meanwhile, what the reset came to waits here for the next
 * mount to say it.
 */
let pendingNotice: string | null = null

/**
 * The knobs the engine reads: injured side, start date, dumbbell max, rest timer, pain logging,
 * plus the red-flag state and a reset. Every change saves at once through the repo and says so.
 * Nothing here decides anything about the knee; Monday-ness and the red-flag rule come from src/rules.
 */
export function Settings() {
  const stored = useSettings()
  if (stored === undefined) {
    return (
      <Screen title={TITLE} lead="Opening storage…">
        <p className="text-body text-on-dark-dim">The settings load from the phone.</p>
      </Screen>
    )
  }
  if (stored === null) {
    return (
      <Screen title={TITLE} lead="No settings yet.">
        <p className="text-body text-on-dark-dim">Open the app from Today once so it can seed its settings, then come back.</p>
      </Screen>
    )
  }
  return <SettingsForm stored={stored} />
}

function SettingsForm({ stored }: { stored: SettingsRecord }) {
  const today = useToday()
  const [draft, setDraft] = useState(stored)
  const draftRef = useRef(stored)
  const storedRef = useRef(stored)
  const pending = useRef(0)
  const mounted = useRef(false)
  const [savedField, flashSaved] = useFlash()
  const [problem, setProblem] = useState<Problem>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resetStep, setResetStep] = useState<ResetStep>('idle')
  // What the last start-date change did to the stored session moves, when it dropped any.
  const [movesNotice, setMovesNotice] = useState<string | null>(null)
  // Where the red-flag section sits is settled once per visit: clearing it, the Saved word that follows, and a
  // rejected clear (which keeps the typed note) all happen in place instead of jumping down the screen.
  const [flagFirst] = useState(() => stored.redFlag.active)

  useEffect(() => {
    mounted.current = true
    if (pendingNotice !== null) {
      setNotice(pendingNotice)
      pendingNotice = null
    }
    return () => {
      mounted.current = false
    }
  }, [])

  // The stored row is the truth whenever no write of ours is in flight; a write's own echo arrives after it resolves.
  useEffect(() => {
    storedRef.current = stored
    if (pending.current === 0) {
      draftRef.current = stored
      setDraft(stored)
    }
  }, [stored])

  function adopt(next: SettingsRecord) {
    draftRef.current = next
    setDraft(next)
  }

  /** Shows the change at once, writes it, and says Saved; a rejected write falls back to what the phone holds. */
  async function save(patch: Partial<SettingsRecord>, field: Field, write: (next: SettingsRecord) => Promise<void> = saveSettings): Promise<void> {
    const next = { ...draftRef.current, ...patch }
    adopt(next)
    setProblem(null)
    pending.current += 1
    try {
      await write(next)
      flashSaved(field)
    } catch (e) {
      adopt(storedRef.current)
      setProblem({ field, text: `That did not save (${errorWords(e)}); the screen shows what the phone still has.` })
    } finally {
      pending.current -= 1
    }
  }

  /**
   * A new start date carries the stored session moves with it, in the same transaction: each is
   * rebased onto the dates it was made for, and any now before week 1 is dropped and said so.
   */
  async function saveStartDate(date: IsoDate): Promise<void> {
    setMovesNotice(null)
    await save({ startDate: date }, 'startDate', async (next) => {
      const change = await saveSettingsAndMoves(next, (stored, moves) => startDateChange(stored.startDate, next.startDate, moves, stored.phaseEnteredWeek))
      setMovesNotice(change.notice)
    })
  }

  /** The rule's refusal in words, or null once the cleared state is on its way to storage. */
  function clearFlag(note: string): string | null {
    const result = clearedSettings(draftRef.current, note, today)
    if (!result.ok) return result.refusal
    void save({ redFlag: result.settings.redFlag }, 'redFlag')
    return null
  }

  async function eraseEverything(): Promise<void> {
    setResetStep('erasing')
    setProblem(null)
    pending.current += 1
    pendingNotice = ERASED
    try {
      await resetAll(defaultSettings(PROGRAM), PROGRAM, today)
    } catch (e) {
      pending.current -= 1
      pendingNotice = null
      setResetStep('confirm')
      setProblem({ field: 'reset', text: `Nothing was erased (${errorWords(e)}); tap again to retry.` })
      return
    }
    try {
      const seeded = await ensureSettings(defaultSettings(PROGRAM))
      pending.current -= 1
      if (mounted.current) {
        pendingNotice = null
        adopt(seeded)
        setNotice(ERASED)
        setResetStep('idle')
      }
    } catch (e) {
      pending.current -= 1
      const text = `Everything was erased, but the default settings did not save (${errorWords(e)}); reload the app to seed them again.`
      if (mounted.current) {
        pendingNotice = null
        setResetStep('idle')
        setProblem({ field: 'reset', text })
      } else {
        pendingNotice = text
      }
    }
  }

  const problemFor = (field: Field) => (problem?.field === field ? problem.text : null)
  const phase = phaseWords(draft, PROGRAM.phases)
  const redFlag = <RedFlagSection state={draft.redFlag} saved={savedField === 'redFlag'} problem={problemFor('redFlag')} onClear={clearFlag} />

  return (
    <Screen title={TITLE} lead="Each change saves on its own; a Saved word confirms it.">
      {notice ? (
        <p role="status" className="text-body text-on-dark">
          {notice}
        </p>
      ) : null}

      {flagFirst ? redFlag : null}

      <Section label="Injured side" saved={savedField === 'injuredSide'} problem={problemFor('injuredSide')}>
        <div role="radiogroup" aria-label="Injured side" className="flex flex-col gap-2">
          {SIDES.map((side) => (
            <Choice
              key={side}
              label={sideWords(side)}
              selected={draft.injuredSide === side}
              selectedWord="Injured"
              onSelect={() => {
                if (draft.injuredSide !== side) void save({ injuredSide: side }, 'injuredSide')
              }}
            />
          ))}
        </div>
        <Note>Unilateral slots log this side first; its reps set the healthy side’s budget.</Note>
      </Section>

      <StartDateSection
        key={draft.startDate}
        startDate={draft.startDate}
        today={today}
        saved={savedField === 'startDate'}
        problem={problemFor('startDate')}
        movesNotice={movesNotice}
        onSave={(date) => void saveStartDate(date)}
      />

      <Section label="Dumbbell max" saved={savedField === 'dumbbellMax'} problem={problemFor('dumbbellMax')}>
        <div role="radiogroup" aria-label="Dumbbell presets" className="grid grid-cols-3 gap-2">
          {DUMBBELL_PRESETS.map((lb) => (
            <Choice
              key={lb}
              compact
              label={`${lb} lb`}
              selected={draft.dumbbellMax === lb}
              onSelect={() => {
                if (draft.dumbbellMax !== lb) void save({ dumbbellMax: lb }, 'dumbbellMax')
              }}
            />
          ))}
        </div>
        <Stepper
          label="Heaviest dumbbell"
          unit="lb"
          value={draft.dumbbellMax}
          step={DUMBBELL_STEP}
          min={DUMBBELL_MIN}
          max={DUMBBELL_MAX}
          onChange={(v) => void save({ dumbbellMax: v }, 'dumbbellMax')}
        />
        <Note>Past this, the engine caps the load or swaps to the next substitution.</Note>
      </Section>

      <Section label="Rest timer" saved={savedField === 'restTimerSeconds'} problem={problemFor('restTimerSeconds')}>
        <Stepper
          label="Rest between sets"
          unit="s"
          value={draft.restTimerSeconds}
          step={REST_STEP}
          min={REST_MIN}
          max={REST_MAX}
          onChange={(v) => void save({ restTimerSeconds: v }, 'restTimerSeconds')}
        />
        <Note>{restTimerWords(draft.restTimerSeconds)} of rest, counted from the moment a set is marked done.</Note>
      </Section>

      <Section label="Pain logging" saved={savedField === 'painPerSet'} problem={problemFor('painPerSet')}>
        <Tap label="Pain per set" value={draft.painPerSet} onChange={(v) => void save({ painPerSet: v }, 'painPerSet')} yes="Per set" no="Per exercise" />
        <Note>{painWords(draft.painPerSet)}</Note>
      </Section>

      <Section label="Phase" saved={false} problem={null}>
        <p className="text-body text-on-dark">{phase.title}</p>
        <p className="text-body text-on-dark-dim">{phase.entered}</p>
        <Note>Read-only here. The Gates screen advances the phase when a gate passes; it arrives in M5.</Note>
      </Section>

      {flagFirst ? null : redFlag}

      <Section label="Backup" saved={false} problem={null}>
        <p className="text-body text-on-dark-dim">Export JSON arrives in M6.</p>
        <p className="text-body text-on-dark-dim">Import JSON arrives in M6.</p>
      </Section>

      <ResetSection
        step={resetStep}
        problem={problemFor('reset')}
        onArm={() => setResetStep('confirm')}
        onDisarm={() => setResetStep('idle')}
        onErase={() => void eraseEverything()}
      />
    </Screen>
  )
}

/** Which field just saved, for the Saved word that shows for a moment. */
function useFlash(): [Field | null, (field: Field) => void] {
  const [field, setField] = useState<Field | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  const flash = (next: Field) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setField(next)
    timer.current = window.setTimeout(() => setField(null), FLASH_MS)
  }
  return [field, flash]
}

/** A labelled group with a Saved word on its label row and a problem sentence under it. */
function Section({ label, saved, problem, children }: { label: string; saved: boolean; problem: string | null; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3 border-t border-on-dark-faint pt-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-small font-normal uppercase tracking-[0.22em] text-on-dark-muted">{label}</h2>
        <span role="status" aria-live="polite" className="font-mono text-small uppercase tracking-[0.22em] text-green-bright">
          {saved ? '✓ Saved' : ''}
        </span>
      </div>
      {children}
      {problem ? (
        <p role="alert" className="text-body text-on-dark">
          {problem}
        </p>
      ) : null}
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-small text-on-dark-muted">{children}</p>
}

/** One of several choices, styled like a Tap: the chosen one says so with a mark and a word, never by color alone. */
function Choice({
  label,
  selected,
  onSelect,
  selectedWord = 'Chosen',
  compact = false,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  selectedWord?: string
  compact?: boolean
}) {
  const mark = <span className="font-mono text-small uppercase tracking-[0.22em]">{selected ? (compact ? '✓' : `✓ ${selectedWord}`) : '○'}</span>
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`tap flex w-full items-center rounded-sm border px-4 py-3 text-body ${compact ? 'justify-center gap-2' : 'justify-between gap-4 text-left'} ${
        selected ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'
      }`}
    >
      {compact ? (
        <>
          {mark}
          <span>{label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          {mark}
        </>
      )}
    </button>
  )
}

/** A date input that only lets a Monday through; any other day is refused in words, with the nearest Mondays a tap away. */
function StartDateSection({
  startDate,
  today,
  saved,
  problem,
  movesNotice,
  onSave,
}: {
  startDate: IsoDate
  today: IsoDate
  saved: boolean
  problem: string | null
  /** How many session moves the last change dropped, in words; null when it dropped none. */
  movesNotice: string | null
  onSave: (date: IsoDate) => void
}) {
  const id = useId()
  const [input, setInput] = useState<string>(startDate)
  const [check, setCheck] = useState<StartDateCheck | null>(null)
  // A picker can pass through several Mondays on the way; each save rebases the stored moves, so
  // the date is saved only on an explicit tap.
  const choose = (value: string) => {
    setInput(value)
    setCheck(checkStartDate(value))
  }
  const pending = check?.ok && check.date !== startDate ? check.date : null
  return (
    <Section label="Start date" saved={saved} problem={problem}>
      <label htmlFor={id} className="text-body text-on-dark-dim">
        Week 1 starts on a Monday
      </label>
      <input id={id} type="date" value={input} onChange={(e) => choose(e.target.value)} className="tap w-full rounded-sm bg-ink px-3 text-body text-on-dark" />
      <Note>
        {weekLine(today, startDate)} {deloadWeeksLine()}
      </Note>
      {pending ? (
        <Button variant="primary" wide onClick={() => onSave(pending)}>
          Save start date
        </Button>
      ) : null}
      <Note>Sessions already moved keep their dates when this changes.</Note>
      {movesNotice ? (
        <p role="status" className="text-body text-on-dark">
          {movesNotice}
        </p>
      ) : null}
      {check && !check.ok ? (
        <>
          <p role="alert" className="text-body text-on-dark">
            {check.message}
          </p>
          {check.mondays.map((monday) => (
            <Button key={monday} wide onClick={() => choose(monday)}>
              Use {dateWords(monday)}
            </Button>
          ))}
        </>
      ) : null}
    </Section>
  )
}

/** The red-flag state in words; clearing it takes a note, and the rule's refusal of an empty one is shown as it is. */
function RedFlagSection({
  state,
  saved,
  problem,
  onClear,
}: {
  state: SettingsRecord['redFlag']
  saved: boolean
  problem: string | null
  onClear: (note: string) => string | null
}) {
  const view = redFlagView(state, PROGRAM.redFlags)
  const noteId = useId()
  const [note, setNote] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  return (
    <Section label="Red flag" saved={saved} problem={problem}>
      {view.active ? (
        <>
          <p className="text-lead font-medium text-on-dark">{view.headline}</p>
          {view.since ? <p className="text-body text-on-dark-dim">{view.since}</p> : null}
          <ul className="flex flex-col gap-1 text-body text-on-dark-dim">
            {view.items.map((item) => (
              <li key={item}>Flagged: {item}.</li>
            ))}
          </ul>
          <p className="text-body text-on-dark-dim">Progression stays suspended until this is cleared with a note: who looked at the knee and what they said.</p>
          <label htmlFor={noteId} className="text-body text-on-dark-dim">
            Note (required)
          </label>
          <textarea id={noteId} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="tap w-full rounded-sm bg-ink p-3 text-body text-on-dark" />
          {refusal ? (
            <p role="alert" className="text-body text-on-dark">
              {refusal}
            </p>
          ) : null}
          <Button variant="primary" wide onClick={() => setRefusal(onClear(note))}>
            Clear the red flag
          </Button>
        </>
      ) : (
        <>
          <p className="text-body text-on-dark">No red flag is set.</p>
          {view.cleared ? <p className="text-body text-on-dark-dim">{view.cleared}</p> : null}
          <Note>A ticked red flag on a morning check sets it; it is cleared here, with a note.</Note>
        </>
      )}
    </Section>
  )
}

/** Two taps to erase: "Reset all data", then "Yes, erase everything"; a way back out sits beside it. */
function ResetSection({
  step,
  problem,
  onArm,
  onDisarm,
  onErase,
}: {
  step: ResetStep
  problem: string | null
  onArm: () => void
  onDisarm: () => void
  onErase: () => void
}) {
  return (
    <Section label="Reset" saved={false} problem={problem}>
      {step === 'idle' ? (
        <Button wide onClick={onArm}>
          Reset all data
        </Button>
      ) : (
        <>
          <p className="text-body text-on-dark">This erases every session, set, morning check, run and setting on this phone. There is no undo.</p>
          <Button wide disabled={step === 'erasing'} onClick={onErase}>
            {step === 'erasing' ? 'Erasing…' : 'Yes, erase everything'}
          </Button>
          <Button variant="quiet" wide disabled={step === 'erasing'} onClick={onDisarm}>
            Keep everything
          </Button>
        </>
      )}
    </Section>
  )
}
