import { useEffect, useState } from 'react'

/**
 * Becomes true `ms` after `active` turns true — e.g. keep the deciding board (and its strike)
 * on screen for a beat before switching to the results. If `active` is already true when the
 * component mounts (someone reloads after the match ended), there's no wait.
 */
export function useHold(active: boolean, ms: number) {
  const [done, setDone] = useState(active)
  useEffect(() => {
    if (!active) {
      setDone(false)
      return
    }
    const t = setTimeout(() => setDone(true), ms)
    return () => clearTimeout(t)
  }, [active, ms])
  return active && done
}
