/**
 * A row of numbered buttons for a 0 to 10 style scale: one tap rates it. The chosen number is
 * inverted and outlined, and the label line says the value in words, so nothing rides on color.
 */
export function ScalePicker({
  label,
  value,
  options,
  onChange,
  unsetWord = 'not rated',
  ariaLabel,
}: {
  label: string
  value: number | null
  options: readonly number[]
  onChange: (value: number) => void
  unsetWord?: string
  ariaLabel?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body text-on-dark-dim">
        {label}: <span className="text-on-dark">{value === null ? unsetWord : value}</span>
      </legend>
      <div role="group" aria-label={ariaLabel ?? label} className="grid grid-cols-6 gap-2">
        {options.map((n) => {
          const on = value === n
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(n)}
              className={`tap touch-manipulation rounded-sm border font-mono text-lead ${on ? 'border-paper bg-paper text-on-light' : 'border-on-dark-faint bg-transparent text-on-dark'}`}
            >
              {n}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export const PAIN_SCALE: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
export const RPE_SCALE: readonly number[] = [5, 6, 7, 8, 9, 10]
