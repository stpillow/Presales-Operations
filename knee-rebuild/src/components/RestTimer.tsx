import { useEffect, useState } from 'react'
import { Button } from './Button.tsx'

/**
 * Counts down from a stored start instant, so a locked screen that freezes JavaScript timers
 * can't stretch the rest: on every tick it recomputes from the clock.
 */
export function RestTimer({ startedAt, seconds, onDone, onSkip, hideAfterSeconds }: { startedAt: number | null; seconds: number; onDone?: () => void; onSkip: () => void; hideAfterSeconds?: number }) {
  const [now, setNow] = useState(() => Date.now())
  const remaining = startedAt === null ? null : Math.max(0, seconds - Math.floor((now - startedAt) / 1000))
  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [startedAt])
  useEffect(() => {
    if (remaining === 0) onDone?.()
  }, [remaining, onDone])
  if (remaining === null) return null
  if (hideAfterSeconds !== undefined && startedAt !== null && now - startedAt > (seconds + hideAfterSeconds) * 1000) return null
  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  return (
    <div role="timer" aria-live="polite" className="flex items-center justify-between gap-4 border-t border-on-dark-faint pt-4">
      <span className="font-mono text-h2 text-on-dark">{remaining === 0 ? 'Go' : `${mm}:${ss}`}</span>
      <span className="text-small text-on-dark-muted">{remaining === 0 ? 'rest is up' : 'rest'}</span>
      <Button variant="quiet" onClick={onSkip}>
        Skip rest
      </Button>
    </div>
  )
}
