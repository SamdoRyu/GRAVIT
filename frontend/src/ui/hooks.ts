// Shared hooks for the HUD. OWNER: ui-builder.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** Re-renders every `ms` so relative times stay fresh. Returns Date.now(). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** Below this width the management rail is an overlay drawer instead of a docked column. */
export const OVERLAY_QUERY = '(max-width: 1100px)'

/** Live `matchMedia(query).matches`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
