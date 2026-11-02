import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import type { Location } from '../../schema/index.ts'

/**
 * "At Hotel gym · Change" under the title (design section 4). Change opens an inline list of the
 * gyms a list offers, one 44 px row each, the session's own marked; it works only until the first
 * set is logged (`gymLocked`), and after that the line reads "At Hotel gym" with no Change, so
 * logged loads never change gyms. The words, the dot and Change share one row: a gym name runs to
 * 60 characters, one word included, and wraps inside its own box, so Change never drops to a line
 * of its own at 375 px (as on Today).
 */
export function GymLine({
  location,
  locations,
  locked,
  busy,
  error,
  elsewhere = null,
  onPick,
}: {
  location: Location
  /** The gyms to offer (`listedLocations`), or undefined while they load. */
  locations: readonly Location[] | undefined
  locked: boolean
  busy: boolean
  /** A change that wasn't saved, in a sentence, or null. */
  error: string | null
  /** When Today plans at another gym than the session's: the words, and the tap that moves Today here too. */
  elsewhere?: { words: string; label: string; onUse: () => void } | null
  onPick: (locationId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const showList = open && !locked
  return (
    <section aria-label="Gym" className="-mt-4 flex flex-col gap-2">
      <p className="flex items-center gap-x-2 text-body text-on-dark">
        <span className="min-w-0 wrap-anywhere">At {location.name}</span>
        {!locked ? (
          <>
            <span aria-hidden="true" className="shrink-0 text-on-dark-muted">
              ·
            </span>
            <Button variant="quiet" className="shrink-0 px-2" aria-expanded={showList} onClick={() => setOpen((v) => !v)}>
              {showList ? 'Keep this gym' : 'Change'}
            </Button>
          </>
        ) : null}
      </p>
      {showList ? (
        <ul aria-label="Gyms" className="flex flex-col">
          {(locations ?? []).map((l) => {
            const current = l.id === location.id
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={current}
                  disabled={busy}
                  onClick={() => {
                    if (!current) onPick(l.id)
                    setOpen(false)
                  }}
                  className="tap flex w-full items-center justify-between gap-3 border-b border-on-dark-faint py-3 text-left text-body text-on-dark disabled:opacity-50"
                >
                  <span className="min-w-0 wrap-anywhere">{l.name}</span>
                  {current ? <span className="shrink-0 whitespace-nowrap font-mono text-small uppercase tracking-[0.22em] text-on-dark">✓ This session</span> : null}
                </button>
              </li>
            )
          })}
          {locations === undefined ? <li className="py-3 text-small text-on-dark-dim">Opening the gyms…</li> : null}
        </ul>
      ) : null}
      {showList ? <p className="text-small text-on-dark-dim">The session plans at the gym picked here, until the first set is logged.</p> : null}
      {elsewhere ? (
        <div className="flex flex-col items-start gap-1">
          <p className="text-small text-on-dark-dim wrap-anywhere">{elsewhere.words}</p>
          <Button variant="quiet" className="wrap-anywhere text-left" disabled={busy} onClick={elsewhere.onUse}>
            {elsewhere.label}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-body text-on-dark wrap-anywhere">
          {error}
        </p>
      ) : null}
    </section>
  )
}
