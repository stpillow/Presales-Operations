import type { ReadingResult } from '../schema/index.ts'

const WORD: Record<ReadingResult, { mark: string; word: string }> = {
  clean: { mark: '✓', word: 'Clean' },
  hold: { mark: '–', word: 'Hold' },
  'back-off': { mark: '↓', word: 'Back off' },
}

/** A reading in words with a mark: the state is readable without color. */
export function ReadingWord({ result, className = '' }: { result: ReadingResult; className?: string }) {
  const { mark, word } = WORD[result]
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-small uppercase tracking-[0.22em] text-on-dark ${className}`}>
      <span aria-hidden="true">{mark}</span>
      {word}
    </span>
  )
}

export function readingSentence(result: ReadingResult): string {
  return { clean: 'Clean: progress when it is clean again.', hold: 'Hold: repeat the last session exactly.', 'back-off': 'Back off: lighter next time.' }[result]
}
