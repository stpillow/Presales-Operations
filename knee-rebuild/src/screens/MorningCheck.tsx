import { useState, type ReactNode } from 'react'
import { navigate } from '../app/router.ts'
import { PROGRAM, planSession } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { ReadingWord, readingSentence } from '../components/ReadingWord.tsx'
import { Screen } from '../components/Screen.tsx'
import { Stepper } from '../components/Stepper.tsx'
import { Tap } from '../components/Tap.tsx'
import { useHistory, useSettings } from '../db/hooks.ts'
import { addMorningCheck, saveSettings, type History } from '../db/repo.ts'
import { addDays, isDeloadWeek } from '../rules/calendar.ts'
import { morningReading } from '../rules/reading.ts'
import { stopMessage } from '../rules/redFlags.ts'
import type { IsoDate, MorningCheck as CheckRecord, Settings } from '../schema/index.ts'
import {
  PAIN_CHANGE_MAX,
  PAIN_CHANGE_MIN,
  buildCheck,
  emptyForm,
  errorWords,
  exerciseSentences,
  formFromCheck,
  nextWeekFor,
  sessionName,
  settingsAfter,
  subjectFor,
  subjectWords,
  toggleFlag,
  withCheck,
  type CheckForm,
  type CheckSubject,
  type ExerciseSentence,
} from './MorningCheck.helpers.ts'

const TITLE = 'Morning check'

/** What a save produced: the record, the settings after it, and the history with it in, for the engine. */
interface Saved {
  check: CheckRecord
  subject: CheckSubject | null
  settings: Settings
  history: History
}

/**
 * The morning after a session: four taps, a pain change, the red-flag checklist and a note.
 * Saving shows the knee's reading in words and, for yesterday's lift, what changes next time.
 * Every decision here comes from src/rules; this screen renders and collects input.
 */
export function MorningCheck() {
  const today = useToday()
  const settings = useSettings()
  const history = useHistory()
  const [saved, setSaved] = useState<Saved | null>(null)
  const [view, setView] = useState<'form' | 'result'>('form')

  if (settings === undefined || history === undefined) {
    return (
      <Screen title={TITLE} lead="Opening storage…">
        <p className="text-body text-on-dark-dim">Yesterday's session and the red-flag state load from the phone.</p>
      </Screen>
    )
  }
  if (settings === null) {
    return (
      <Screen title={TITLE} lead="No settings yet.">
        <p className="text-body text-on-dark-dim">Open the app from Today once so it can seed its settings, then come back.</p>
      </Screen>
    )
  }

  if (view === 'result' && saved) {
    return <Result saved={saved} onChange={() => setView('form')} />
  }

  const yesterday = addDays(today, -1)
  const subject = subjectFor(history.workouts, history.runs, yesterday)
  const existing = saved?.check ?? history.morningChecks.find((c) => c.date === today) ?? null
  // No key on the form: the live history refreshes the moment its own first write lands, and a
  // remount then would wipe the form and the sentence about a second write (the red-flag state)
  // that failed. The form reads `initial` once, on mount, so it keeps its state across that refresh.
  return (
    <CheckFormScreen
      initial={existing}
      today={today}
      yesterday={yesterday}
      subject={subject}
      settings={settings}
      history={history}
      onSaved={(result) => {
        setSaved(result)
        setView('result')
      }}
    />
  )
}

/** A short mono label over a group, the way the components label their own states. */
function Label({ children }: { children: ReactNode }) {
  return <h2 className="font-mono text-small font-normal uppercase tracking-[0.22em] text-on-dark-muted">{children}</h2>
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <Label>{label}</Label>
      {children}
    </section>
  )
}

function CheckFormScreen({
  initial,
  today,
  yesterday,
  subject,
  settings,
  history,
  onSaved,
}: {
  initial: CheckRecord | null
  today: IsoDate
  yesterday: IsoDate
  subject: CheckSubject | null
  settings: Settings
  history: History
  onSaved: (saved: Saved) => void
}) {
  const [form, setForm] = useState<CheckForm>(() => (initial ? formFromCheck(initial) : emptyForm()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = 'morning-check-note'
  const set = <K extends keyof CheckForm>(key: K) => (value: CheckForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const existingReading = initial ? morningReading(initial) : null

  async function save() {
    const check = buildCheck({ today, subject, form, catalog: PROGRAM.redFlags })
    const next = settingsAfter(settings, check)
    setSaving(true)
    setError(null)
    try {
      await addMorningCheck(check)
    } catch (e) {
      setError(`The check did not save (${errorWords(e)}). Nothing was written; tap Save again.`)
      setSaving(false)
      return
    }
    if (next !== settings) {
      try {
        await saveSettings(next)
      } catch (e) {
        setError(`The check saved, but the red-flag state did not (${errorWords(e)}). Tap Save again to retry.`)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onSaved({ check, subject, settings: next, history: withCheck(history, check) })
  }

  return (
    <Screen title={TITLE} lead={subjectWords(subject, yesterday, PROGRAM.templates)}>
      {initial && existingReading ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-on-dark-dim">
          <span>Already checked in this morning:</span>
          <ReadingWord result={existingReading.result} />
          <span>Saving again replaces it.</span>
        </p>
      ) : null}

      <Section label="Knee this morning">
        <Tap label="Stiffness gone within 30 minutes" value={form.stiffnessUnder30Min} onChange={set('stiffnessUnder30Min')} />
        <Tap label="Worse than yesterday" value={form.worseThanYesterday} onChange={set('worseThanYesterday')} />
        <Tap label="Visible swelling" value={form.visibleSwelling} onChange={set('visibleSwelling')} />
        <Tap label="Warmth" value={form.warmth} onChange={set('warmth')} />
      </Section>

      <Section label="Pain">
        <Stepper label="Pain change since yesterday" unit="points" value={form.painChangePoints} onChange={set('painChangePoints')} min={PAIN_CHANGE_MIN} max={PAIN_CHANGE_MAX} />
        <p className="text-small text-on-dark-muted">Minus means less pain than yesterday. Up 2 or more reads back off.</p>
      </Section>

      <Section label="Red flags">
        <p className="text-small text-on-dark-muted">{PROGRAM.redFlagsIntro}</p>
        {PROGRAM.redFlags.map((flag) => (
          <Tap key={flag.id} label={flag.text} value={form.redFlags.includes(flag.id)} onChange={() => set('redFlags')(toggleFlag(form.redFlags, flag.id))} yes="Flagged" no="No" />
        ))}
        <p className="text-small text-on-dark-dim">{PROGRAM.notFlags}</p>
      </Section>

      <Section label="Note">
        <label htmlFor={noteId} className="text-body text-on-dark-dim">
          Optional. Anything the taps did not catch.
        </label>
        <textarea
          id={noteId}
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes')(e.target.value)}
          className="tap w-full rounded-sm bg-ink p-3 text-body text-on-dark"
        />
      </Section>

      {error ? (
        <p role="alert" className="text-body text-on-dark">
          {error}
        </p>
      ) : null}
      <Button variant="primary" wide disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save check'}
      </Button>
    </Screen>
  )
}

function Result({ saved, onChange }: { saved: Saved; onChange: () => void }) {
  const { check, subject, settings, history } = saved
  const reading = morningReading(check)
  const stop = stopMessage(settings.redFlag, PROGRAM.redFlags)
  return (
    <Screen
      title={TITLE}
      lead={
        <>
          <span className="text-green-bright">Saved.</span> {subjectWords(subject, addDays(check.date, -1), PROGRAM.templates)}
        </>
      }
    >
      <Section label="Reading">
        <div className="flex flex-col gap-2">
          <ReadingWord result={reading.result} />
          <p className="text-lead text-on-dark">{readingSentence(reading.result)}</p>
        </div>
        <ul className="flex flex-col gap-1 text-body text-on-dark-dim">
          {reading.reasons.map((reason) => (
            <li key={reason}>Because: {reason}.</li>
          ))}
        </ul>
      </Section>

      {stop ? (
        <Section label="Red flag">
          <p className="text-lead font-medium text-on-dark">{stop.headline}</p>
          <ul className="flex flex-col gap-1 text-body text-on-dark-dim">
            {stop.items.map((item) => (
              <li key={item}>Flagged: {item}.</li>
            ))}
          </ul>
          <p className="text-body text-on-dark-dim">Progression is suspended until the red-flag state is cleared in Settings with a note.</p>
          <Button onClick={() => navigate({ name: 'settings' })}>Open Settings</Button>
        </Section>
      ) : null}

      <Section label="Next time">
        <NextTime subject={subject} settings={settings} history={history} />
      </Section>

      <div className="flex flex-col gap-3">
        <Button variant="primary" wide onClick={() => navigate({ name: 'today' })}>
          Today
        </Button>
        <Button variant="quiet" wide onClick={onChange}>
          Change this check
        </Button>
      </div>
    </Screen>
  )
}

/** For yesterday's lift: one sentence per exercise from the engine, planned with the new history. */
function NextTime({ subject, settings, history }: { subject: CheckSubject | null; settings: Settings; history: History }) {
  if (!subject) {
    return <p className="text-body text-on-dark-dim">No session was logged for yesterday, so this check changes nothing on its own.</p>
  }
  if (subject.kind === 'run') {
    return <p className="text-body text-on-dark-dim">Yesterday was a run. Its reading counts toward the week's mileage cap; the run logger and the Week screen arrive in M4.</p>
  }
  const { workout } = subject
  const template = PROGRAM.templates.find((t) => t.id === workout.templateId)
  if (!template) {
    return <p className="text-body text-on-dark-dim">Yesterday's session uses a template this program does not have ({workout.templateId}), so there is nothing to plan from.</p>
  }
  const week = nextWeekFor(workout)
  let sentences: ExerciseSentence[]
  try {
    sentences = exerciseSentences(planSession({ template, week, settings, history }), settings.injuredSide)
  } catch (e) {
    return <p className="text-body text-on-dark-dim">The next session could not be planned ({errorWords(e)}).</p>
  }
  return (
    <>
      <p className="text-body text-on-dark">
        Next {sessionName(template.id, PROGRAM.templates)}, week {week}
        {isDeloadWeek(week) ? ', a deload week' : ''}:
      </p>
      {workout.status === 'in-progress' ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-on-dark-dim">Yesterday's session was never finished, so its sets do not count yet. Finish or abandon it in the runner; the next plan will read them.</p>
          <Button onClick={() => navigate({ name: 'session', workoutId: workout.id })}>Open yesterday's session</Button>
        </div>
      ) : null}
      {sentences.length === 0 ? (
        <p className="text-body text-on-dark-dim">Nothing is written for that session yet.</p>
      ) : (
        <ul className="flex flex-col">
          {sentences.map((s) => (
            <li key={s.slotId} className="flex flex-col gap-1 border-t border-on-dark-faint py-3">
              <span className="text-body font-medium text-on-dark">
                {s.name}
                {s.optional ? <span className="text-on-dark-muted"> (optional)</span> : null}
              </span>
              {s.lines.map((line) => (
                <span key={line} className="text-body text-on-dark-dim">
                  {line}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
