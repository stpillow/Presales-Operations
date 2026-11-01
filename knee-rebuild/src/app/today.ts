import { useEffect, useState } from 'react'
import { todayIn } from '../rules/calendar.ts'
import type { IsoDate } from '../schema/index.ts'

/** Today's date in America/New_York, refreshed each minute and whenever the app comes back to the front. */
export function useToday(): IsoDate {
  const [today, setToday] = useState<IsoDate>(() => todayIn(new Date()))
  useEffect(() => {
    const refresh = () => setToday(todayIn(new Date()))
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return today
}
