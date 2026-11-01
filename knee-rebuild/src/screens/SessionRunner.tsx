import { Screen } from '../components/Screen.tsx'

/** Built in M3; see docs/m3-brief.md for what this screen must do. */
export function SessionRunner({ workoutId }: { workoutId: string }) {
  return (
    <Screen title="Session" lead={`Workout ${workoutId}`}>
      <p className="text-body text-on-dark-dim">This screen arrives in M3.</p>
    </Screen>
  )
}
