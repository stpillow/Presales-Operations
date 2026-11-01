import { Screen } from '../components/Screen.tsx'

/** Screens that arrive in later milestones say so, in words, rather than showing nothing. */
export function Placeholder({ title, milestone, what }: { title: string; milestone: string; what: string }) {
  return (
    <Screen title={title} lead={`Arrives in ${milestone}.`}>
      <p className="text-body text-on-dark-dim">{what}</p>
    </Screen>
  )
}
