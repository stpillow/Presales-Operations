import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useRoute } from './app/router.ts'
import { useToday } from './app/today.ts'
import { Button } from './components/Button.tsx'
import { TabBar } from './components/TabBar.tsx'
import { useActiveLocation, useSettings } from './db/hooks.ts'
import { defaultSettings, ensureLocations, ensureSettings, requestPersistentStorage } from './db/repo.ts'
import { program } from './program/program.ts'
import { MorningCheck } from './screens/MorningCheck.tsx'
import { More } from './screens/More.tsx'
import { Placeholder } from './screens/Placeholder.tsx'
import { RunLogger } from './screens/RunLogger.tsx'
import { SessionRunner } from './screens/SessionRunner.tsx'
import { Settings } from './screens/Settings.tsx'
import { Today } from './screens/Today.tsx'
import { Week } from './screens/Week.tsx'

export function App() {
  const route = useRoute()
  const settings = useSettings()
  const activeLocation = useActiveLocation()
  const today = useToday()
  const [seedError, setSeedError] = useState<string | null>(null)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    // Settings first: the home gym is written from the dumbbell max they hold (design section 2).
    ensureSettings(defaultSettings(program))
      .then(() => ensureLocations(program, today))
      .then(() => requestPersistentStorage())
      .catch((e: unknown) => setSeedError(e instanceof Error ? e.message : String(e)))
    // Once, at launch: the day the home gym is first written is the day the app opened.
  }, [])

  if (seedError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col gap-4 px-4 py-12">
        <h1 className="font-display text-h2 text-on-dark">Storage could not be opened</h1>
        <p className="text-body text-on-dark-dim">The app keeps everything on this phone, and the phone refused: {seedError}. Private browsing blocks it on iOS; open the app from the home screen icon instead.</p>
      </main>
    )
  }
  // Every screen plans at a gym: wait for the home gym too, which ensureLocations writes right after the settings.
  if (settings === undefined || settings === null || activeLocation === undefined || activeLocation === null) {
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
            return <RunLogger />
          case 'week':
            return <Week />
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
