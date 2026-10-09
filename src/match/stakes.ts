import { onValue, ref, remove, serverTimestamp, set } from 'firebase/database'
import { useEffect, useState } from 'react'
import { db, playerId, signIn } from '../lib/firebase'
import type { Room } from '../lobby/rooms'

/**
 * Stakes: what a room plays for, agreed in the waiting room. The app only keeps score of who owes
 * whom — nothing changes hands through it. A debt lives at debts/{id} (readable by the two people in
 * it), with an index of ids at owes/{uid} for each of them. It's settled once both tick Paid.
 */

/** `winner`: every loser owes the winner. `last`: the bottom player owes everyone else. */
export type StakeFormat = 'winner' | 'last'
export interface Stake {
  text: string
  format: StakeFormat
}

export const STAKE_MAX = 32
export const STAKE_IDEAS = ['₵5', '₵10', '₵20', 'Waakye', 'Drinks', 'Bragging rights']

/** A debt between two players in a match: player ids, and how many share it (a tie at the bottom). */
export interface Owe {
  from: string
  to: string
  part?: number
}

/**
 * Who owes whom when a match ends. `finished`: everyone still in, with their score (two-player
 * games: 1 for the winner, 0 for the loser). `leavers`: anyone who pressed Leave during this match —
 * they count as last. Level at the top voids the stake; level at the bottom splits it.
 */
export function settle(stake: Stake, finished: { id: string; score: number }[], leavers: string[]): Owe[] {
  if (!finished.length) return []
  const top = Math.max(...finished.map((p) => p.score))
  const atTop = finished.filter((p) => p.score === top)
  if (stake.format === 'last' || finished.length === 1) {
    if (leavers.length) return leavers.flatMap((from) => finished.map((p) => ({ from, to: p.id })))
    const low = Math.min(...finished.map((p) => p.score))
    if (low === top) return []
    const bottom = finished.filter((p) => p.score === low)
    const part = bottom.length > 1 ? bottom.length : undefined
    return bottom.flatMap((b) => finished.filter((p) => p.score !== low).map((p) => ({ from: b.id, to: p.id, part })))
  }
  if (atTop.length !== 1) return []
  const winner = atTop[0].id
  return [...finished.filter((p) => p.id !== winner).map((p) => p.id), ...leavers].map((from) => ({ from, to: winner }))
}

/** Players who pressed Leave during the match now ending (rematches start a new one). */
export const leaversThisMatch = (room: Room) =>
  Object.entries(room.stakeLeft ?? {})
    .filter(([, at]) => at === room.startedAt)
    .map(([id]) => id)

const debtId = (room: Room, o: Owe) => `${room.game}_${room.code}_${room.startedAt ?? 0}_${o.from}_${o.to}`

/**
 * Saves this match's debts that involve me. Every phone in the match does the same, so each debt is
 * written by whichever gets there first; the rules refuse the rest, which is fine.
 */
export async function recordDebts(room: Room, owes: Owe[]) {
  const me = playerId()
  const name = (id: string) => room.players?.[id]?.name ?? 'Player'
  for (const o of owes) {
    if (o.from !== me && o.to !== me) continue
    const id = debtId(room, o)
    await set(ref(db, `debts/${id}`), {
      from: o.from,
      to: o.to,
      fromName: name(o.from),
      toName: name(o.to),
      stake: room.stake!.text,
      ...(o.part ? { part: o.part } : {}),
      game: room.game,
      code: room.code,
      at: serverTimestamp(),
    }).catch(() => {}) // already written by the other phone
    for (const uid of [o.from, o.to]) await set(ref(db, `owes/${uid}/${id}`), true).catch(() => {})
  }
}

/** "Kofi owes you ₵10", "You owe Esi ₵10 (split 2 ways)" — for a result screen. */
export function oweLines(room: Room, owes: Owe[], me: string): string[] {
  const name = (id: string) => (id === me ? 'You' : room.players?.[id]?.name ?? 'Player')
  const what = (o: Owe) => `${room.stake!.text}${o.part ? ` (split ${o.part} ways)` : ''}`
  return owes.map((o) => `${name(o.from)} ${o.from === me ? 'owe' : 'owes'} ${o.to === me ? 'you' : name(o.to)} ${what(o)}`)
}

/** matches settled on this phone (by startedAt), in case the room's marker hasn't come back yet */
const settledHere = new Set<string>()
const matchKey = (room: Room) => `${room.game}:${room.code}:${room.startedAt}`

/**
 * The stake lines for a finished match: who owes whom, or why nobody does. Saves my debts as a side
 * effect. From a result screen (`ended` false) it also marks the match settled, so leaving afterwards
 * costs nothing; a match that ended because someone left (`ended`) is only settled if it wasn't yet.
 */
export function stakeResult(room: Room, finished: { id: string; score: number }[], me: string, ended?: string): string[] | null {
  if (!room.stake) return null
  if (ended && (room.stakeDone === room.startedAt || settledHere.has(matchKey(room)))) return null
  // a watcher sees who owes whom, but only the players settle it
  const player = !!room.players?.[me]
  if (player) settledHere.add(matchKey(room))
  if (player && !ended && room.startedAt) set(ref(db, `matches/${room.game}/${room.code}/stakeDone`), room.startedAt).catch(() => {})
  const owes = settle(room.stake, finished, leaversThisMatch(room))
  if (player) recordDebts(room, owes).catch(() => {})
  const off = ended
  if (owes.length) return oweLines(room, owes, me)
  if (off) return [off]
  return [room.stake.format === 'last' && finished.length > 2 ? 'All level, so the stake is off' : 'No clear winner, so the stake is off']
}

/* ── The ledger ──────────────────────────────────────────────────────── */

export interface Debt {
  id: string
  from: string
  to: string
  fromName: string
  toName: string
  stake: string
  part?: number
  game: string
  at: number
  paid?: Record<string, boolean>
}

/** My debts, both ways, newest first. Settled ones (both ticked Paid) are dropped from my index. */
export function useDebts(): { me: string | null; debts: Debt[] } {
  const [me, setMe] = useState<string | null>(null)
  const [debts, setDebts] = useState<Record<string, Debt>>({})

  useEffect(() => {
    let alive = true
    signIn().then((uid) => alive && setMe(uid)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!me) return
    const subs: Record<string, () => void> = {}
    const stop = onValue(ref(db, `owes/${me}`), (snap) => {
      const ids = Object.keys(snap.val() ?? {})
      for (const id of Object.keys(subs)) {
        if (ids.includes(id)) continue
        subs[id]()
        delete subs[id]
        setDebts(({ [id]: _, ...rest }) => rest)
      }
      for (const id of ids) {
        if (subs[id]) continue
        subs[id] = onValue(
          ref(db, `debts/${id}`),
          (d) => {
            const v = d.val() as Omit<Debt, 'id'> | null
            if (!v) return
            if (v.paid?.[v.from] && v.paid?.[v.to]) {
              remove(ref(db, `owes/${me}/${id}`)).catch(() => {}) // settled: tidy it out of my list
              return
            }
            setDebts((all) => ({ ...all, [id]: { ...v, id } }))
          },
          () => {},
        )
      }
    }, () => {})
    return () => {
      stop()
      Object.values(subs).forEach((f) => f())
    }
  }, [me])

  return { me, debts: Object.values(debts).sort((a, b) => b.at - a.at) }
}

/** Ticks (or unticks) my side of a debt. */
export function markPaid(id: string, paid: boolean) {
  const r = ref(db, `debts/${id}/paid/${playerId()}`)
  return (paid ? set(r, true) : remove(r)).catch(() => {})
}
