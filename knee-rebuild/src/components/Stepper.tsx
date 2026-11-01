import { useId } from 'react'

export interface StepperProps {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  /** Allows decimals in the typed value (miles). */
  decimal?: boolean
}

/**
 * The gym input: minus, a numeric field that opens the numeric keypad, plus. Every target is 44 px.
 * Typing is allowed for a jump (a load of 45 from 0); the buttons do the one-handed work.
 */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit, decimal = false }: StepperProps) {
  const id = useId()
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const round = (n: number) => (decimal ? Math.round(n * 100) / 100 : Math.round(n))
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-body text-on-dark-dim">
        {label}
        {unit ? <span className="text-on-dark-muted"> ({unit})</span> : null}
      </label>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`${label} down`} className="tap rounded-sm bg-navy-lift text-h3 text-on-dark" onClick={() => onChange(clamp(round(value - step)))}>
          −
        </button>
        <input
          id={id}
          inputMode={decimal ? 'decimal' : 'numeric'}
          pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
          className="tap w-16 rounded-sm bg-ink text-center font-mono text-lead text-on-dark"
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => {
            const n = Number(e.target.value.replace(',', '.'))
            if (!Number.isNaN(n)) onChange(clamp(round(n)))
          }}
        />
        <button type="button" aria-label={`${label} up`} className="tap rounded-sm bg-navy-lift text-h3 text-on-dark" onClick={() => onChange(clamp(round(value + step)))}>
          +
        </button>
      </div>
    </div>
  )
}
