import { useEffect, useState } from 'react'
import { watchConnected } from '../lobby/rooms'
import { RECONNECT_MS } from './useOpponentAway'

/** a drop shorter than this (the socket hopping networks, the first connect on load) isn't worth a banner */
const GRACE_MS = 1500

/**
 * The other side of "they disconnected": when it's THIS phone that has dropped, say so here too,
 * so you aren't left staring at a board that has quietly stopped updating while your opponent
 * watches a countdown on you.
 */
export function SelfOffline() {
  const [down, setDown] = useState<number | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    let timer: number | undefined
    const stop = watchConnected((up) => {
      clearTimeout(timer)
      if (up) setDown(null)
      else timer = window.setTimeout(() => setDown(Date.now() - GRACE_MS), GRACE_MS)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [])

  useEffect(() => {
    if (down === null) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [down])

  if (down === null) return null
  const left = Math.ceil((down + RECONNECT_MS - Date.now()) / 1000)
  return (
    <p className="mt-banner mt-banner--self" role="alert">
      {left > 0
        ? `You’re offline · reconnecting… get back within ${left}s or the match ends`
        : 'You’re offline · reconnecting… the match may have ended'}
    </p>
  )
}
