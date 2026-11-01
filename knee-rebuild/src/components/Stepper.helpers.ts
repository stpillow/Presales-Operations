/**
 * What a half-typed Stepper field means. "2." and "" are still being typed, so they send nothing
 * up; only a whole number (or a whole decimal, when decimals are allowed) does.
 */
export function parseStepperText(text: string, decimal: boolean): number | null {
  const t = text.trim().replace(',', '.')
  const whole = decimal ? /^\d+(\.\d+)?$|^\.\d+$/ : /^\d+$/
  if (!whole.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** The text shown for a value when the field is not being edited. */
export function stepperText(value: number): string {
  return Number.isNaN(value) ? '' : String(value)
}
