import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useRoute } from './app/router.ts'
import { Button } from './components/Button.tsx'
import { TabBar } from './components/TabBar.tsx'
import { useSettings } from './db/hooks.ts'
import { defaultSettings, ensureSettings, requestPersistentStorage } from './db/repo.ts'
import { program, programError } from './program/program.ts'
import { MorningCheck } from './screens/MorningCheck.tsx'
import { More } from './screens/More.tsx'
import { Placeholder } from './screens/Placeholder.tsx'
import { SessionRunner } from './screens/SessionRunner.tsx'
import { Settings } from './screens/Settings.tsx'
import { Today } from './screens/Today.tsx'

function ProgramError({ error }: { error: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col gap-4 px-4 py-12">
      <h1 className="font-display text-h2 text-on-dark">The program data did not validate</h1>
      <p className="text-body text-on-dark-dim">The app cannot run until `data/program.json` matches its schema. The validator said:</p>
      <pre className="whitespace-pre-wrap font-mono text-small text-on-dark">{error}</pre>
    </main>
  )
}

export function App() {
  const route = useRoute()
  const settings = useSettings()
  const [seedError, setSeedError] = useState<string | null>(null)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (programError) return
    ensureSettings(defaultSettings(program))
      .then(() => requestPersistentStorage())
      .catch((e: unknown) => setSeedError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (programError) return <ProgramError error={programError} />
  if (seedError) return <ProgramError error={`Storage could not be opened: ${seedError}. Private browsing blocks it on iOS.`} />
  if (settings === undefined || settings === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col gap-4 px-4 py-12">
        <h1 className="font-display text-h2 text-on-dark">Knee Rebuild</h1>
        <p className="text-body text-on-dark-dim">Opening storage…</p>
      </main>
    )
  }

  return (
    <>
      {needRefresh ? (
        <div role="status" className="mx-auto flex max-w-[36rem] items-center justify-between gap-4 px-4 pt-4 text-small text-on-dark">
          <span>A new version is ready. It will not reload on its own.</span>
          <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
            Reload now
          </Button>
        </div>
      ) : null}
      {(() => {
        switch (route.name) {
          case 'today':
            return <Today />
          case 'session':
            return <SessionRunner workoutId={route.workoutId} />
          case 'morning':
            return <MorningCheck />
          case 'settings':
            return <Settings />
          case 'more':
            return <More />
          case 'run':
            return <Placeholder title="Run logger" milestone="M4" what="Type, miles, minutes, effort, max pain, strides and tempo, a Strava link, and the week's miles against target." />
          case 'week':
            return <Placeholder title="Week" milestone="M4" what="Seven days with each day's session and reading in words, the deload badge, miles against target, and a move-session action." />
          case 'progress':
            return <Placeholder title="Progress" milestone="M5" what="Load over time per exercise, symmetry per unilateral exercise, weekly miles against plan, consecutive clean days." />
          case 'gates':
            return <Placeholder title="Gates" milestone="M5" what="The current gate's checklist evaluated live, hop-test entry, and the Advance phase button." />
          case 'program':
            return <Placeholder title="Program" milestone="M6" what="The current phase's sessions, an editor for cues and substitutions, and program.md as reference." />
        }
      })()}
      {route.name === 'session' ? null : <TabBar route={route} />}
    </>
  )
}
