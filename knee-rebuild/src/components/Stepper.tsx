import { useId, useState } from 'react'
import { beginEdit, stepperField, typedValue, type StepperEdit } from './Stepper.helpers.ts'

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
 * Focus empties the field and shows the value as the placeholder, so what is typed replaces the
 * value (4.5 over a prefilled 3 is 4.5, not 34.5); leaving it empty keeps the value. While the
 * field has focus it keeps the typed text, so "2." can become "2.5" instead of 25.
 */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit, decimal = false }: StepperProps) {
  const id = useId()
  const [edit, setEdit] = useState<StepperEdit | null>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const round = (n: number) => (decimal ? Math.round(n * 100) / 100 : Math.round(n))
  const bump = (delta: number) => {
    setEdit(null)
    onChange(clamp(round(value + delta)))
  }
  const field = stepperField(edit, value)
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-body text-on-dark-dim">
        {label}
        {unit ? <span className="text-on-dark-muted"> ({unit})</span> : null}
      </label>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`${label} down`} className="tap rounded-sm bg-navy-lift text-h3 text-on-dark" onClick={() => bump(-step)}>
          −
        </button>
        <input
          id={id}
          inputMode={decimal ? 'decimal' : 'numeric'}
          pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
          className="tap w-16 rounded-sm bg-ink text-center font-mono text-lead text-on-dark placeholder:text-on-dark-muted"
          value={field.text}
          placeholder={field.placeholder}
          onFocus={() => setEdit(beginEdit(value))}
          onChange={(e) => {
            const text = e.target.value
            const start = edit?.start ?? value
            setEdit({ draft: text, start })
            const n = typedValue(text, { decimal, start, current: value })
            if (n !== null) onChange(clamp(round(n)))
          }}
          onBlur={() => setEdit(null)}
        />
        <button type="button" aria-label={`${label} up`} className="tap rounded-sm bg-navy-lift text-h3 text-on-dark" onClick={() => bump(step)}>
          +
        </button>
      </div>
    </div>
  )
}
