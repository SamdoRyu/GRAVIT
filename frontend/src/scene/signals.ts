// A `today` hook that rolls over at midnight so overdue states update without a data change.
import { useEffect, useState } from 'react'
import { todayIso } from '../data/selectors'

/** Local YYYY-MM-DD, updated shortly after midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayIso())
  useEffect(() => {
    let timer: number
    const arm = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = window.setTimeout(() => {
        setToday(todayIso())
        arm()
      }, Math.max(1000, next.getTime() - now.getTime()))
    }
    arm()
    return () => window.clearTimeout(timer)
  }, [])
  return today
}
