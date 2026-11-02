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

/** A field being edited: the text typed so far and the value the edit started from. */
export interface StepperEdit {
  draft: string
  start: number
}

/**
 * Focus starts from an empty field, so the first key typed replaces the value instead of adding to
 * it: a tap leaves the caret at the end of a prefilled 3, and 4.5 typed after it read 34.5 (M4
 * review). The value stays on show as the placeholder.
 */
export function beginEdit(value: number): StepperEdit {
  return { draft: '', start: value }
}

/** What the field shows: the typed text and the value as its placeholder while editing, else the value. */
export function stepperField(edit: StepperEdit | null, value: number): { text: string; placeholder: string | undefined } {
  return edit ? { text: edit.draft, placeholder: stepperText(value) } : { text: stepperText(value), placeholder: undefined }
}

/**
 * What a keystroke sends up while editing: the typed number, nothing while it is half-typed ("2."),
 * and for an emptied field the value the edit started from (nothing when that is still the value).
 */
export function typedValue(text: string, edit: { decimal: boolean; start: number; current: number }): number | null {
  if (text.trim().length === 0) return edit.current === edit.start ? null : edit.start
  return parseStepperText(text, edit.decimal)
}
