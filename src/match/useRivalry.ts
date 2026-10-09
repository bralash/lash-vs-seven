import { useState } from 'react'
import { gameBySlug } from '../games/registry'
import type { Me } from '../lobby/Lobby'
import type { Room, Seat } from '../lobby/rooms'
import { featById, ordinal } from './feats'
import { describe, flip, groupKey, groupLead, localKey, recordGroup, recordResult, standingLine, standings, type Outcome, type Rival } from './rivalry'
import { useSession } from './session'
import { stakeResult } from './stakes'
import { clearVoice } from './Voice'
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
  /** who owes whom, in a match played for stakes */
  stakes?: string[] | null
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
  const { local, bot, watching } = useSession(game, room.code)
  // recording is idempotent per match id, so doing it while rendering is safe (and avoids a flicker)
  const [view] = useState(() => {
    // the record is about people: games against Ops aren't kept, and a watcher has no record here
    if (bot || watching) return null
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
    const stakes = stakeResult(room, seats.flatMap((p, s) => (p ? [{ id: p.id, score: winner === s ? 1 : 0 }] : [])), me.id)
    clearVoice(room, me.id)
    const r = recordResult({ game, key: opp.id, name: opp.name, outcome, matchId, feats: mine })
    const bySeat: [number, number] = me.seat === 0 ? [r.total.w, r.total.l] : [r.total.l, r.total.w]
    const ordered = mine && ([mine.me, mine.them] as [string[], string[]])
    return { ...describe(r, 'You', opp.name, name), card: cardLine(names, bySeat), feats: earned(r, ordered, 'You', opp.name, true), stakes }
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
 * Results of a game for up to four. Two left at the end: the usual head-to-head. Three or four: one
 * record for the group as a whole (those same people), counting how many matches each has won —
 * the top scorer takes the match, nobody does when the top is level. Only players still in at the
 * end count (leavers aren't recorded, as in two-player games).
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
): RivalryView | null {
  const { local, bot } = useSession(game, room.code)
  const [view] = useState<RivalryView | null>(() => {
    if (bot) return null
    const stakes = local ? null : stakeResult(room, finished.flatMap((s) => (players[s] ? [{ id: players[s]!.id, score: scores[s] }] : [])), me.id)
    if (!local) clearVoice(room, me.id) // the match is over: its voice notes go
    const matchId = `${game}:${room.code}:${room.createdAt}:${matchNo}`
    const gameName = (slug: string) => gameBySlug(slug)?.name ?? slug
    const nameOf = (s: number) => players[s]?.name ?? `Player ${s + 1}`
    const top = Math.max(...finished.map((s) => scores[s]))
    const atTop = finished.filter((s) => scores[s] === top)

    if (finished.length === 2) {
      const [a, b] = finished
      const outcome = (x: number, y: number): Outcome => (scores[x] === scores[y] ? 'draw' : scores[x] > scores[y] ? 'win' : 'loss')
      const pair: [string, string] = [nameOf(a), nameOf(b)]
      if (local) {
        const aFirst = pair[0].trim().toLowerCase() <= pair[1].trim().toLowerCase()
        const stored = recordResult({ game, key: localKey(pair), name: `${pair[0]} & ${pair[1]}`, outcome: aFirst ? outcome(a, b) : outcome(b, a), matchId })
        const r = aFirst ? stored : flip(stored)
        return { ...describe(r, pair[0], pair[1], gameName), card: cardLine(pair, [r.total.w, r.total.l]), feats: [] }
      }
      const opp = players[a === me.seatN ? b : a]
      if (!opp) return null
      const r = recordResult({ game, key: opp.id, name: opp.name, outcome: outcome(me.seatN, a === me.seatN ? b : a), matchId })
      const bySeat = me.seatN === a ? r : flip(r)
      return { ...describe(r, 'You', opp.name, gameName), card: cardLine(pair, [bySeat.total.w, bySeat.total.l]), feats: [], stakes }
    }

    // three or four: the group's record. Online members are uids; in pass & play, names in lower case.
    const keyOf = (s: number) => (local ? nameOf(s).trim().toLowerCase() : players[s]?.id ?? `seat${s}`)
    const members = Object.fromEntries(finished.map((s) => [keyOf(s), nameOf(s)]))
    const g = recordGroup({
      game,
      key: groupKey(Object.keys(members), local),
      members,
      you: local ? undefined : me.id,
      winner: atTop.length === 1 ? keyOf(atTop[0]) : null,
      matchId,
    })
    const you = local ? undefined : me.id
    const table = standings(g.wins, g.members, you)
    const s = g.streak && g.streak.n >= 2 ? g.streak : null
    const streaker = s && (s.who === you ? 'You' : g.members[s.who])
    return {
      line: `${groupLead(table)} · ${g.played} played together`,
      streak: s ? `${streaker} ${streaker === 'You' ? 'have' : 'has'} won ${s.n} in a row` : null,
      split: standingLine(table),
      card: `${standingLine(standings(g.wins, g.members))} · all-time`.toUpperCase(),
      feats: [],
      stakes,
    }
  })
  return view
}
