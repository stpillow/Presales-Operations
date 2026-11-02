import { Button } from '../../components/Button.tsx'

export interface GymAction {
  label: string
  onPress: () => void
}

/**
 * What the gym does to the slot on the card, in words (design section 4): "Not at Hotel gym: …",
 * "Nothing here for …" with Skip and Do it anyway, "Rack-capped at 25 lb: …", and the marks a
 * Swap pick or Do it anyway offers. The words and the offers come from the runner's helpers and
 * src/rules/runnerGym.ts; this only lays them out.
 */
export function GymNotes({ lines, actions, busy }: { lines: readonly string[]; actions: readonly GymAction[]; busy: boolean }) {
  if (lines.length === 0 && actions.length === 0) return null
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
    </div>
  )
}
