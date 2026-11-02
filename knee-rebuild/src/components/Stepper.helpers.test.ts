import { describe, expect, it } from 'vitest'
import { beginEdit, parseStepperText, stepperField, stepperText, typedValue } from './Stepper.helpers.ts'

describe('parseStepperText', () => {
  it('reads whole numbers', () => {
    expect(parseStepperText('45', false)).toBe(45)
    expect(parseStepperText(' 12 ', false)).toBe(12)
  })

  it('sends nothing for text still being typed', () => {
    expect(parseStepperText('', false)).toBeNull()
    expect(parseStepperText('2.', true)).toBeNull()
    expect(parseStepperText('.', true)).toBeNull()
    expect(parseStepperText('2.5.', true)).toBeNull()
  })

  it('reads decimals only when they are allowed', () => {
    expect(parseStepperText('2.5', true)).toBe(2.5)
    expect(parseStepperText('2,5', true)).toBe(2.5)
    expect(parseStepperText('.5', true)).toBe(0.5)
    expect(parseStepperText('2.5', false)).toBeNull()
  })

  it('rejects anything that is not a number', () => {
    expect(parseStepperText('-3', true)).toBeNull()
    expect(parseStepperText('1e3', true)).toBeNull()
    expect(parseStepperText('abc', false)).toBeNull()
  })

  it('typing 2.5 one key at a time never reads as 25', () => {
    const seen = ['2', '2.', '2.5'].map((t) => parseStepperText(t, true))
    expect(seen).toEqual([2, null, 2.5])
  })
})

describe('stepperText', () => {
  it('shows the value, or nothing for NaN', () => {
    expect(stepperText(2.5)).toBe('2.5')
    expect(stepperText(Number.NaN)).toBe('')
  })
})

describe('editing a prefilled value', () => {
  it('starts from an empty field, with the value shown as the placeholder', () => {
    const edit = beginEdit(3)
    expect(edit).toEqual({ draft: '', start: 3 })
    expect(stepperField(edit, 3)).toEqual({ text: '', placeholder: '3' })
    expect(stepperField(null, 3)).toEqual({ text: '3', placeholder: undefined })
  })

  it('typing 4.5 over a prefilled 3 sends 4.5, never 34.5 or 4.53', () => {
    const start = beginEdit(3).start
    const seen = ['4', '4.', '4.5'].map((t) => typedValue(t, { decimal: true, start, current: 3 }))
    expect(seen).toEqual([4, null, 4.5])
  })

  it('keeps the typed text while focused, so 2.5 still never reads 25', () => {
    expect(stepperField({ draft: '2.', start: 3 }, 2)).toEqual({ text: '2.', placeholder: '2' })
    expect(['2', '2.', '2.5'].map((t) => typedValue(t, { decimal: true, start: 3, current: 3 }))).toEqual([2, null, 2.5])
  })

  it('a field left or made empty keeps the value the edit started from', () => {
    expect(typedValue('', { decimal: true, start: 3, current: 3 })).toBeNull()
    expect(typedValue('  ', { decimal: false, start: 45, current: 45 })).toBeNull()
    expect(typedValue('', { decimal: true, start: 3, current: 4 })).toBe(3)
  })
})
