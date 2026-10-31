import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db } from './db/db'

type StorageState = 'opening' | 'ready' | 'failed'

/**
 * M0 shell. Proves the three things the scaffold has to prove on a phone:
 * the page loads offline, IndexedDB opens, and a new deploy waits for a tap instead of reloading.
 * Screens arrive in M3. Nothing here decides anything; decisions live in src/rules/.
 */
export function App() {
  const [storage, setStorage] = useState<StorageState>('opening')
  const [online, setOnline] = useState(() => navigator.onLine)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    let cancelled = false
    db.open()
      .then(() => {
        if (!cancelled) setStorage('ready')
      })
      .catch(() => {
        if (!cancelled) setStorage('failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-h1 text-on-dark">Knee Rebuild</h1>
        <p className="max-w-[32rem] text-lead text-on-dark-dim">
          Says what to do <span className="text-green-bright">today</span>, logs what happened,
          reads the knee, and decides what comes next.
        </p>
      </header>

      <section aria-labelledby="status-heading" className="flex flex-col gap-3">
        <h2 id="status-heading" className="font-display text-h3 text-on-dark">
          Scaffold status
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-on-dark-muted">Program</dt>
          <dd className="text-on-dark">Week 1 starts Monday, Nov 2, 2026</dd>
          <dt className="text-on-dark-muted">Storage</dt>
          <dd className="text-on-dark">{storageLabel(storage)}</dd>
          <dt className="text-on-dark-muted">Network</dt>
          <dd className="text-on-dark">{online ? 'Online' : 'Offline, running from cache'}</dd>
          <dt className="text-on-dark-muted">Build</dt>
          <dd className="text-on-dark">M0 scaffold. Screens arrive in M3.</dd>
        </dl>
      </section>

      {needRefresh ? (
        <section
          role="status"
          className="flex flex-col gap-3 border-t border-on-dark-faint pt-6 text-body"
        >
          <p className="text-on-dark">A new version is ready. It will not reload on its own.</p>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="tap w-fit rounded-sm bg-paper px-6 py-3 font-sans text-body font-medium text-on-light"
          >
            Reload now
          </button>
        </section>
      ) : null}
    </main>
  )
}

function storageLabel(state: StorageState): string {
  switch (state) {
    case 'opening':
      return 'Opening IndexedDB…'
    case 'ready':
      return 'IndexedDB ready (Dexie, empty schema)'
    case 'failed':
      return 'IndexedDB failed to open. Private browsing blocks it on iOS.'
  }
}
