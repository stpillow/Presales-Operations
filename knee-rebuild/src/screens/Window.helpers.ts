import type { Fit } from '../rules/fitWindow.ts'

/** The lines under the time control, in words: what the full session takes, what fits, what is left out. */
export function windowWords(fit: Fit, minutes: number | null, total: number, nameOf: (slotId: string) => string): string[] {
  if (minutes === null) return [`The full session: about ${fit.fullMinutes} min.`]
  const lines = [`The full session is about ${fit.fullMinutes} min.`]
  if (fit.dropped.length === 0) {
    lines.push(`In ${minutes} min all ${total} ${total === 1 ? 'exercise fits' : 'exercises fit'}.`)
  } else {
    lines.push(`In ${minutes} min, ${fit.keep.length} of ${total} exercises fit (about ${fit.keptMinutes} min).`)
    lines.push(`Left out: ${fit.dropped.map(nameOf).join(', ')}.`)
  }
  if (!fit.fits) lines.push(`The first exercise and what is already logged stay, and run past ${minutes} min.`)
  return lines
}
