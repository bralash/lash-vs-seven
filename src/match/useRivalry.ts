import { useState } from 'react'
import { gameBySlug } from '../games/registry'
import type { Me } from '../lobby/Lobby'
import type { Room, Seat } from '../lobby/rooms'
import { describe, flip, localKey, recordResult, type Outcome } from './rivalry'
import { useSession } from './session'
import type { Seated } from './types'

export interface RivalryView {
  /** "You lead Seven 7–5 all-time" */
  line: string
  /** "You have won 3 in a row", from 2 */
  streak: string | null
  /** "Checkers 4–1 · Word Hunt 2–6", once you've met in more than one game */
  split: string | null
  /** for the share card, in seat order: "LASH 7 — 5 SEVEN · ALL-TIME" */
  card: string
}

/**
 * Used by every game's Results: counts this finished match once (refreshes and re-renders are
 * ignored), then returns the all-time record against this opponent.
 */
export function useRivalry(game: string, room: Room, me: Me, seats: [Seated | null, Seated | null], winner: Seat | -1, matchNo: number): RivalryView | null {
  const { local } = useSession(game, room.code)
  // recording is idempotent per match id, so doing it while rendering is safe (and avoids a flicker)
  const [view] = useState(() => {
    const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
    const matchId = `${game}:${room.code}:${room.createdAt}:${matchNo}`
    const name = (slug: string) => gameBySlug(slug)?.name ?? slug

    if (local) {
      // stored from the side of the name that sorts first; shown from player 1's side
      const firstSeat: Seat = names[0].trim().toLowerCase() <= names[1].trim().toLowerCase() ? 0 : 1
      const outcome: Outcome = winner === -1 ? 'draw' : winner === firstSeat ? 'win' : 'loss'
      const stored = recordResult({ game, key: localKey(names), name: `${names[0]} & ${names[1]}`, outcome, matchId })
      const r = firstSeat === 0 ? stored : flip(stored)
      return { ...describe(r, names[0], names[1], name), card: cardLine(names, [r.total.w, r.total.l]) }
    }

    const opp = seats[me.seat === 0 ? 1 : 0]
    if (!opp) return null
    const outcome: Outcome = winner === -1 ? 'draw' : winner === me.seat ? 'win' : 'loss'
    const r = recordResult({ game, key: opp.id, name: opp.name, outcome, matchId })
    const bySeat: [number, number] = me.seat === 0 ? [r.total.w, r.total.l] : [r.total.l, r.total.w]
    return { ...describe(r, 'You', opp.name, name), card: cardLine(names, bySeat) }
  })
  return view
}

function cardLine(names: [string, string], wins: [number, number]) {
  return `${names[0]} ${wins[0]} — ${wins[1]} ${names[1]} · all-time`.toUpperCase()
}
