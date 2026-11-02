import { Button } from '../../components/Button.tsx'

export interface GymAction {
  label: string
  onPress: () => void
}

/** The card's ask for the gym's heaviest dumbbell (`asksForRack`): the words, then a 44 px button per rack. */
export interface RackAsk {
  words: string
  choices: GymAction[]
}

/**
 * What the gym does to the slot on the card, in words (design section 4): "Not at Hotel gym: …",
 * "Nothing here for …" with Skip and Do it anyway, the marks a Swap pick or Do it anyway offers,
 * and at a gym with no dumbbells set, the ask for its heaviest one. The words and the offers come from the runner's helpers and
 * src/rules/runnerGym.ts; this only lays them out.
 */
export function GymNotes({ lines, actions, rack = null, busy }: { lines: readonly string[]; actions: readonly GymAction[]; rack?: RackAsk | null; busy: boolean }) {
  if (lines.length === 0 && actions.length === 0 && rack === null) return null
  return (
    <div aria-label="At this gym" className="flex flex-col gap-2">
      {lines.map((line) => (
        <p key={line} className="text-small text-on-dark wrap-anywhere">
          {line}
        </p>
      ))}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.label} disabled={busy} onClick={a.onPress}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
      {rack ? (
        <div role="group" aria-label="Heaviest dumbbell here" className="flex flex-col gap-2">
          <p className="text-small text-on-dark wrap-anywhere">{rack.words}</p>
          <div className="flex flex-wrap gap-2">
            {rack.choices.map((c) => (
              <Button key={c.label} disabled={busy} onClick={c.onPress}>
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
