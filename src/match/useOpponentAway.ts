import { useEffect, useState } from 'react'
import { abandonRoom } from '../lobby/rooms'
import type { Seated } from './types'

/** An opponent who drops offline mid-round has this long to come back before the match ends. */
export const RECONNECT_MS = 20_000

/**
 * While `active` (a round is in progress) and the opponent is offline, counts down RECONNECT_MS
 * and then ends the match for both. Returns the seconds left, or null while they're connected.
 * Ticks itself while counting, since most match screens only re-render when the room changes (which,
 * with the opponent gone, it doesn't) — the countdown used to sit frozen at 20s.
 */
export function useOpponentAway(game: string, code: string, opp: Seated | null, active: boolean): number | null {
  const away = active && !!opp && !opp.online
  const [since, setSince] = useState<number | null>(null)
  const [, tick] = useState(0)
  const oppId = opp?.id

  useEffect(() => {
    if (!away || !oppId) {
      setSince(null)
      return
    }
    setSince(Date.now())
    const t = setTimeout(() => abandonRoom(game, code, oppId, 'disconnected').catch(() => {}), RECONNECT_MS)
    return () => clearTimeout(t)
  }, [away, oppId, game, code]) // restart only when "away" flips, not on every room update

  useEffect(() => {
    if (since === null) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [since])

  return since === null ? null : Math.max(0, Math.ceil((since + RECONNECT_MS - Date.now()) / 1000))
}
