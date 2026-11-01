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

/**
 * What a reading means, in words: a description, not a consequence. What happens next depends on
 * the reading before it too (two holds read back off; a second clean progresses), so screens that
 * say what changes next show the engine's own note for the next session.
 */
export function readingSentence(result: ReadingResult): string {
  return {
    clean: 'Clean: pain 3 or under, not climbing, and a quiet morning.',
    hold: 'Hold: pain 4 to 5, climbing, not rated, or a stiffer morning.',
    'back-off': 'Back off: pain over 5, a stop for sharp joint-line pain, or swelling, warmth or a 2-point rise.',
  }[result]
}
