import type { ReactNode } from 'react'
import { Button } from '../../components/Button.tsx'

/**
 * The one place the thumb goes between sets, fixed at the bottom: the rest timer when one is
 * running, a line saying exactly what the button will log, and the button itself.
 */
export function DoneBar({ timer, line, label, disabled, onPress }: { timer?: ReactNode; line: string; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <div aria-label="Done bar" className="fixed inset-x-0 bottom-0 z-10 border-t border-on-dark-faint bg-navy px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[36rem] flex-col gap-2">
        {timer}
        <p className="text-small text-on-dark-dim">{line}</p>
        <Button variant="primary" wide disabled={disabled} onClick={onPress} className="touch-manipulation">
          {label}
        </Button>
      </div>
    </div>
  )
}
