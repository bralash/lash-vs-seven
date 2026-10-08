import { useState } from 'react'
import { gameBySlug } from '../games/registry'
import type { Me } from '../lobby/Lobby'
import type { Room, Seat } from '../lobby/rooms'
import { featById, ordinal } from './feats'
import { describe, flip, localKey, recordResult, type Outcome, type Rival } from './rivalry'
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
  /** feats earned this match, with how many times each has now been earned against this rival */
  feats: FeatEarned[]
}
export interface FeatEarned {
  id: string
  name: string
  blurb: string
  /** "UNTOUCHED · You · first vs Seven" → who: "You", note: "first vs Seven" */
  who: string
  note: string
  first: boolean
}

/**
 * Used by every game's Results: counts this finished match once (refreshes and re-renders are
 * ignored), then returns the all-time record against this opponent. `feats` are the feat ids each
 * seat earned this match, for games that have them.
 */
export function useRivalry(
  game: string,
  room: Room,
  me: Me,
  seats: [Seated | null, Seated | null],
  winner: Seat | -1,
  matchNo: number,
  feats?: [string[], string[]],
): RivalryView | null {
  const { local, bot } = useSession(game, room.code)
  // recording is idempotent per match id, so doing it while rendering is safe (and avoids a flicker)
  const [view] = useState(() => {
    // the record is about people: games against Ops aren't kept
    if (bot) return null
    const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
    const matchId = `${game}:${room.code}:${room.createdAt}:${matchNo}`
    const name = (slug: string) => gameBySlug(slug)?.name ?? slug

    if (local) {
      // stored from the side of the name that sorts first; shown from player 1's side
      const firstSeat: Seat = names[0].trim().toLowerCase() <= names[1].trim().toLowerCase() ? 0 : 1
      const outcome: Outcome = winner === -1 ? 'draw' : winner === firstSeat ? 'win' : 'loss'
      const byFirst = feats && { me: feats[firstSeat], them: feats[firstSeat === 0 ? 1 : 0] }
      const stored = recordResult({ game, key: localKey(names), name: `${names[0]} & ${names[1]}`, outcome, matchId, feats: byFirst })
      const r = firstSeat === 0 ? stored : flip(stored)
      // shown from player 1's side: "me" is seat 0
      return { ...describe(r, names[0], names[1], name), card: cardLine(names, [r.total.w, r.total.l]), feats: earned(r, feats, names[0], names[1], false) }
    }

    const opp = seats[me.seat === 0 ? 1 : 0]
    if (!opp) return null
    const outcome: Outcome = winner === -1 ? 'draw' : winner === me.seat ? 'win' : 'loss'
    const mine = feats && { me: feats[me.seat], them: feats[me.seat === 0 ? 1 : 0] }
    const r = recordResult({ game, key: opp.id, name: opp.name, outcome, matchId, feats: mine })
    const bySeat: [number, number] = me.seat === 0 ? [r.total.w, r.total.l] : [r.total.l, r.total.w]
    const ordered = mine && ([mine.me, mine.them] as [string[], string[]])
    return { ...describe(r, 'You', opp.name, name), card: cardLine(names, bySeat), feats: earned(r, ordered, 'You', opp.name, true) }
  })
  return view
}

/** This match's feats, mine first: [my ids, their ids], named from `me`/`them`'s side of the record. */
function earned(r: Rival, ids: [string[], string[]] | undefined, me: string, them: string, online: boolean): FeatEarned[] {
  if (!ids) return []
  const out: FeatEarned[] = []
  ;(['me', 'them'] as const).forEach((side, k) => {
    for (const id of ids[k]) {
      const def = featById(id)
      if (!def) continue
      const n = r.feats?.[id]?.[side] ?? 1
      const against = side === 'me' ? them : online ? 'you' : me
      out.push({ id, name: def.name, blurb: def.blurb, who: side === 'me' ? me : them, note: `${n === 1 ? 'first' : ordinal(n)} vs ${against}`, first: n === 1 })
    }
  })
  return out
}

function cardLine(names: [string, string], wins: [number, number]) {
  return `${names[0]} ${wins[0]} — ${wins[1]} ${names[1]} · all-time`.toUpperCase()
}

/**
 * Results of a game for up to four: counted pairwise by final score — a win against everyone who
 * finished below you, a loss against everyone above, a draw on equal points. Only players still in
 * at the end count (leavers aren't recorded, as in two-player games). Online that's one line for each
 * person you played; in pass & play every pair is kept, shown from the top scorer's side.
 */
export function useRivalryMulti(
  game: string,
  room: Room,
  me: Me,
  players: (Seated | null)[],
  scores: number[],
  /** the seats still in at the end */
  finished: number[],
  matchNo: number,
): RivalryView[] {
  const { local, bot } = useSession(game, room.code)
  const [views] = useState(() => {
    if (bot) return []
    const base = `${game}:${room.code}:${room.createdAt}:${matchNo}`
    const gameName = (slug: string) => gameBySlug(slug)?.name ?? slug
    const nameOf = (s: number) => players[s]?.name ?? `Player ${s + 1}`
    const outcome = (a: number, b: number): Outcome => (scores[a] === scores[b] ? 'draw' : scores[a] > scores[b] ? 'win' : 'loss')
    const view = (r: Rival, a: string, b: string, pair?: [string, string]): RivalryView => ({
      ...describe(r, a, b, gameName),
      card: pair ? cardLine(pair, [r.total.w, r.total.l]) : '',
      feats: [],
    })

    if (local) {
      const top = [...finished].sort((a, b) => scores[b] - scores[a])[0]
      const out: RivalryView[] = []
      finished.forEach((a, i) =>
        finished.slice(i + 1).forEach((b) => {
          const names: [string, string] = [nameOf(a), nameOf(b)]
          const aFirst = names[0].trim().toLowerCase() <= names[1].trim().toLowerCase()
          const [first, second] = aFirst ? [a, b] : [b, a]
          const stored = recordResult({ game, key: localKey(names), name: `${names[0]} & ${names[1]}`, outcome: outcome(first, second), matchId: `${base}:${a}-${b}` })
          // shown from the top scorer's side (or player a's, for pairs without them)
          const side = b === top ? b : a
          const r = side === first ? stored : flip(stored)
          if (a === top || b === top) out.push(view(r, nameOf(side), nameOf(side === a ? b : a), finished.length === 2 ? [nameOf(0), nameOf(1)] : undefined))
        }),
      )
      return out
    }

    return finished
      .filter((s) => s !== me.seatN && players[s])
      .map((s) => {
        const opp = players[s]!
        const r = recordResult({ game, key: opp.id, name: opp.name, outcome: outcome(me.seatN, s), matchId: `${base}:${opp.id}` })
        const pair: [string, string] | undefined = finished.length === 2 ? [nameOf(finished[0]), nameOf(finished[1])] : undefined
        const bySeat = me.seatN < s ? r : flip(r)
        return { ...view(r, 'You', opp.name), card: pair ? cardLine(pair, [bySeat.total.w, bySeat.total.l]) : '' }
      })
  })
  return views
}
