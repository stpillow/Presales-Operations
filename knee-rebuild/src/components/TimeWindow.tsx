import { WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, WINDOW_STEP } from '../rules/fitWindow.ts'
import { Stepper } from './Stepper.tsx'

/**
 * "How much time do you have?": Full session, or Fit to my time with the minutes. The choice is a
 * word and a mark, never color alone. What fits is worked out by the caller (`windowFit`) and
 * passed in as lines of words.
 */
export function TimeWindow({ minutes, onChange, lines }: { minutes: number | null; onChange: (minutes: number | null) => void; lines: readonly string[] }) {
  const choice = (label: string, selected: boolean, onSelect: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`tap flex w-full items-center justify-center gap-2 rounded-sm border px-3 py-3 text-body ${selected ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'}`}
    >
      <span className="shrink-0 font-mono text-small uppercase tracking-[0.22em]">{selected ? '✓' : '○'}</span>
      <span>{label}</span>
    </button>
  )
  return (
    <section aria-label="Time for this session" className="flex flex-col gap-3">
      <h3 className="font-mono text-small font-normal uppercase tracking-[0.22em] text-on-dark-muted">Time you have</h3>
      <div role="radiogroup" aria-label="Time for this session" className="grid grid-cols-2 gap-2">
        {choice('Full session', minutes === null, () => onChange(null))}
        {choice('Fit to my time', minutes !== null, () => onChange(minutes ?? WINDOW_DEFAULT))}
      </div>
      {minutes !== null ? <Stepper label="Minutes" value={minutes} onChange={(m) => onChange(m)} min={WINDOW_MIN} max={WINDOW_MAX} step={WINDOW_STEP} /> : null}
      {lines.map((line) => (
        <p key={line} className="text-small text-on-dark-dim wrap-anywhere">
          {line}
        </p>
      ))}
    </section>
  )
}
