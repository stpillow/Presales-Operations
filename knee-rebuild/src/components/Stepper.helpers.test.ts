import { describe, expect, it } from 'vitest'
import { parseStepperText, stepperText } from './Stepper.helpers.ts'

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
