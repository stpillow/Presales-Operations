import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

/** Short labels in Plex Mono, as the other screens set them. */
export const LABEL = 'font-mono text-small font-normal uppercase tracking-[0.22em] text-on-dark-muted'
export const HEADING = 'font-sans text-h3 font-medium text-on-dark'

const FLASH_MS = 1500

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-small text-on-dark-muted wrap-anywhere">{children}</p>
}

/** A sentence that a write failed or an entry was refused, in words. */
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-body text-on-dark wrap-anywhere">
      {children}
    </p>
  )
}

/**
 * A small 44 px control for a list row (Up, Down, Remove): a word on it, the full sense in its
 * aria-label ("Move cue 2 up"), a border so it reads as a control without color.
 */
export function RowButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={`tap rounded-sm border border-on-dark-faint bg-transparent px-3 text-small font-medium text-on-dark disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

/** One of several choices: the chosen one says so with a mark and a word, never by color alone. */
export function Choice({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`tap flex w-full items-center justify-center gap-2 rounded-sm border px-3 py-3 text-body ${
        selected ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'
      }`}
    >
      <span className="shrink-0 font-mono text-small uppercase tracking-[0.22em]">{selected ? '✓' : '○'}</span>
      <span>{label}</span>
    </button>
  )
}

/** A labelled group with a Saved word on its label row. */
export function Group({ label, saved, children }: { label: string; saved: boolean; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h4 className={LABEL}>{label}</h4>
        <span role="status" aria-live="polite" className="shrink-0 whitespace-nowrap font-mono text-small uppercase tracking-[0.22em] text-green-bright">
          {saved ? '✓ Saved' : ''}
        </span>
      </div>
      {children}
    </section>
  )
}

/** Which group just saved, for the Saved word that shows for a moment. */
export function useFlash<T extends string>(): [T | null, (which: T) => void] {
  const [which, setWhich] = useState<T | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  const flash = (next: T) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setWhich(next)
    timer.current = window.setTimeout(() => setWhich(null), FLASH_MS)
  }
  return [which, flash]
}
