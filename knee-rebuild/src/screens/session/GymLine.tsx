import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import type { Location } from '../../schema/index.ts'

/**
 * "At Hotel gym · Change" under the title (design section 4). Change opens an inline list of the
 * gyms a list offers, one 44 px row each, the session's own marked; it works only until the first
 * set is logged (`gymLocked`), and after that the line reads "At Hotel gym" with no Change, so
 * logged loads never change gyms.
 */
export function GymLine({
  location,
  locations,
  locked,
  busy,
  onPick,
}: {
  location: Location
  /** The gyms to offer (`listedLocations`), or undefined while they load. */
  locations: readonly Location[] | undefined
  locked: boolean
  busy: boolean
  onPick: (locationId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const showList = open && !locked
  return (
    <section aria-label="Gym" className="-mt-4 flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-2 text-body text-on-dark">
        <span>At {location.name}</span>
        {!locked ? (
          <>
            <span aria-hidden="true" className="text-on-dark-muted">
              ·
            </span>
            <Button variant="quiet" className="px-2" aria-expanded={showList} onClick={() => setOpen((v) => !v)}>
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
                  <span>{l.name}</span>
                  {current ? <span className="shrink-0 font-mono text-small uppercase tracking-[0.22em] text-on-dark">✓ This session</span> : null}
                </button>
              </li>
            )
          })}
          {locations === undefined ? <li className="py-3 text-small text-on-dark-dim">Opening the gyms…</li> : null}
        </ul>
      ) : null}
      {showList ? <p className="text-small text-on-dark-dim">The session plans at the gym picked here, until the first set is logged.</p> : null}
    </section>
  )
}
