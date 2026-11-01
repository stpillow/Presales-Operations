import { navigate } from '../app/router.ts'
import { Button } from '../components/Button.tsx'
import { Screen } from '../components/Screen.tsx'

export function More() {
  return (
    <Screen title="More" lead="The rest of the app.">
      <div className="flex flex-col gap-3">
        <Button wide onClick={() => navigate({ name: 'morning' })}>Morning check</Button>
        <Button wide onClick={() => navigate({ name: 'run' })}>Log a run</Button>
        <Button wide onClick={() => navigate({ name: 'program' })}>Program</Button>
        <Button wide onClick={() => navigate({ name: 'settings' })}>Settings</Button>
      </div>
    </Screen>
  )
}
