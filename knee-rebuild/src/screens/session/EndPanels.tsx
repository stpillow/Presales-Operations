import { useState } from 'react'
import { Button } from '../../components/Button.tsx'
import { PAIN_SCALE, ScalePicker } from '../../components/ScalePicker.tsx'

/** Finish, inline: what wasn't logged, max pain during the session, then the write. */
export function FinishPanel({ notLogged, loggedMax, busy, onFinish, onBack }: { notLogged: string[]; loggedMax: number | null; busy: boolean; onFinish: (maxPain: number | null) => void; onBack: () => void }) {
  const [maxPain, setMaxPain] = useState<number | null>(loggedMax)
  return (
    <section aria-label="Finish session" className="flex flex-col gap-4 rounded-md bg-navy-lift p-4">
      <h2 className="font-sans text-h3 font-semibold text-on-dark">Finish the session</h2>
      {notLogged.length > 0 ? (
        <p className="text-body text-on-dark-dim">
          Not logged: {notLogged.join(', ')}. They keep last session&apos;s prescription.
        </p>
      ) : (
        <p className="text-body text-on-dark-dim">Every required set is logged.</p>
      )}
      <ScalePicker label="Max pain during the session" value={maxPain} options={PAIN_SCALE} onChange={setMaxPain} />
      <Button variant="primary" wide disabled={busy} onClick={() => onFinish(maxPain)}>
        Finish session
      </Button>
      <Button variant="quiet" onClick={onBack}>
        Back
      </Button>
    </section>
  )
}

/** End without finishing, inline: says what is kept, then marks the workout abandoned. */
export function EndPanel({ loggedCount, busy, onEnd, onBack }: { loggedCount: number; busy: boolean; onEnd: () => void; onBack: () => void }) {
  return (
    <section aria-label="End without finishing" className="flex flex-col gap-4 rounded-md bg-navy-lift p-4">
      <h2 className="font-sans text-h3 font-semibold text-on-dark">End without finishing</h2>
      <p className="text-body text-on-dark-dim">
        Keeps the {loggedCount} {loggedCount === 1 ? 'set' : 'sets'} logged; they still count toward the next prescriptions. No max-pain question.
      </p>
      <Button wide disabled={busy} onClick={onEnd}>
        End session
      </Button>
      <Button variant="quiet" onClick={onBack}>
        Back
      </Button>
    </section>
  )
}
