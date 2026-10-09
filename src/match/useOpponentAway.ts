import { useEffect, useRef, useState } from 'react'
import { abandonRoom, dropPlayer } from '../lobby/rooms'
import { useWatching } from './session'
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
  // a watcher never ends anyone's match: the players' own phones do that
  const away = active && !useWatching() && !!opp && !opp.online
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

/**
 * useOpponentAway for games for up to four. Every other player still in who drops offline mid-round
 * gets RECONNECT_MS to come back; then they're dropped (dropPlayer): the match carries on without them
 * if two or more are left, otherwise it's over. Returns who's away and the seconds each has left.
 */
export function useAwayPlayers(game: string, code: string, others: Seated[], active: boolean): { id: string; name: string; secs: number }[] {
  const away = active && !useWatching() ? others.filter((p) => !p.online) : []
  const awayKey = away.map((p) => p.id).join(',')
  const since = useRef<Record<string, number>>({})
  const [, tick] = useState(0)

  useEffect(() => {
    const now = Date.now()
    const ids = awayKey ? awayKey.split(',') : []
    // keep the clock running for anyone still away, start it for the newly away, forget the rest
    since.current = Object.fromEntries(ids.map((id) => [id, since.current[id] ?? now]))
    if (!ids.length) return
    const t = setInterval(() => {
      tick((n) => n + 1)
      for (const [id, at] of Object.entries(since.current)) {
        if (Date.now() - at < RECONNECT_MS) continue
        delete since.current[id]
        dropPlayer(game, code, id, 'disconnected').catch(() => {})
      }
    }, 500)
    return () => clearInterval(t)
  }, [awayKey, game, code])

  return away
    .filter((p) => since.current[p.id] !== undefined)
    .map((p) => ({ id: p.id, name: p.name, secs: Math.max(0, Math.ceil((since.current[p.id] + RECONNECT_MS - Date.now()) / 1000)) }))
}
