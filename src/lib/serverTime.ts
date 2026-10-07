import { onValue, ref } from 'firebase/database'
import { useEffect, useState } from 'react'
import { db } from './firebase'

/**
 * Firebase's estimate of (server clock − local clock), so both players
 * agree on when a timed round starts and ends regardless of device clocks.
 */
export function useServerOffset() {
  const [offset, setOffset] = useState(0)
  useEffect(() => onValue(ref(db, '.info/serverTimeOffset'), (s) => setOffset(Number(s.val()) || 0)), [])
  return offset
}

/** Re-renders every `ms` and returns the current server time. */
export function useServerNow(ms = 100) {
  const offset = useServerOffset()
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    setNow(Date.now() + offset)
    const t = setInterval(() => setNow(Date.now() + offset), ms)
    return () => clearInterval(t)
  }, [offset, ms])
  return now
}
