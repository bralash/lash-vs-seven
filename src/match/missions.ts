import { get, onValue, ref, runTransaction } from 'firebase/database'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, signIn } from '../lib/firebase'
import type { Level } from './bot'

/*
 * Weekly missions: three small goals a week, the same three for everyone, paying chips once done
 * and collected. The week turns over on Monday 00:00 UTC (Ghana time); the three are picked from
 * the week number, so every phone shows the same ones with no server.
 *
 * What counts: online matches with friends count for everything; against Ops only her missions;
 * pass & play and watching count for nothing. Matches tick missions from payOut (chips.ts), so a
 * match only counts when it paid: not under 20 seconds, and a win over the day's limit against the
 * same rival counts as played, not won (so two friends can't farm quick wins).
 *
 * Progress lives in the wallet: wallets/{uid}/missions = { w: week, n: {id: count}, s: {id: {key}},
 * got: {id} }, replaced whole when a new week starts.
 */

export type Tier = 1 | 2 | 3
export const REWARD: Record<Tier, number> = { 1: 30, 2: 60, 3: 120 }
/** for collecting all three in a week */
export const BONUS = 90
export const BONUS_ID = 'all'
export const TIER_NAME: Record<Tier, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

export type MissionEvent =
  | {
      k: 'match'
      game: string
      out: 'win' | 'loss' | 'draw'
      /** against Ops, at this level */
      ops?: Level
      /** a win that paid in full (not over the day's limit against this rival) */
      fullWin?: boolean
      /** a 3–4 player match */
      group?: boolean
      /** your run of wins against them, this one included */
      streak?: number
    }
  | { k: 'throw' | 'sticker' | 'taunt' | 'ult' | 'voice' }

export interface Mission {
  id: string
  tier: Tier
  name: string
  blurb: string
  target: number
  /** what this event adds: a number, or a key (counts distinct keys: different games) */
  take: (e: MissionEvent) => number | string | 0
}

const friend = (e: MissionEvent) => (e.k === 'match' && !e.ops ? e : null)
const friendWin = (e: MissionEvent) => {
  const m = friend(e)
  return m && m.out === 'win' && m.fullWin ? m : null
}
const opsWin = (e: MissionEvent) => (e.k === 'match' && e.ops && e.out === 'win' ? e : null)
const on = (k: MissionEvent['k']) => (e: MissionEvent) => (e.k === k ? 1 : 0)

export const POOL: Mission[] = [
  // easy
  { id: 'play5', tier: 1, name: 'Warm-up', blurb: 'Play 5 matches with friends', target: 5, take: (e) => (friend(e) ? 1 : 0) },
  { id: 'throw10', tier: 1, name: 'Food fight', blurb: 'Throw 10 things at your rivals', target: 10, take: on('throw') },
  { id: 'stick10', tier: 1, name: 'Chatterbox', blurb: 'Send 10 stickers in matches', target: 10, take: on('sticker') },
  { id: 'taunt3', tier: 1, name: 'Show-off', blurb: 'Taunt your rivals 3 times', target: 3, take: on('taunt') },
  { id: 'voice3', tier: 1, name: 'Say it loud', blurb: 'Send 3 voice notes in matches', target: 3, take: on('voice') },
  { id: 'ops3', tier: 1, name: 'Ops practice', blurb: 'Beat Ops 3 times, any level', target: 3, take: (e) => (opsWin(e) ? 1 : 0) },
  // medium
  { id: 'games3', tier: 2, name: 'Mix it up', blurb: 'Play 3 different games with friends', target: 3, take: (e) => friend(e)?.game ?? 0 },
  { id: 'win3', tier: 2, name: 'Winner', blurb: 'Win 3 matches with friends', target: 3, take: (e) => (friendWin(e) ? 1 : 0) },
  { id: 'ult2', tier: 2, name: 'Ultimate power', blurb: 'Fire 2 Ultimates', target: 2, take: on('ult') },
  { id: 'group2', tier: 2, name: 'Party', blurb: 'Play 2 matches with 3 or 4 players', target: 2, take: (e) => (friend(e)?.group ? 1 : 0) },
  { id: 'play12', tier: 2, name: 'Regular', blurb: 'Play 12 matches with friends', target: 12, take: (e) => (friend(e) ? 1 : 0) },
  { id: 'opshard', tier: 2, name: 'Hard target', blurb: 'Beat Ops on Hard', target: 1, take: (e) => (opsWin(e)?.ops === 'hard' ? 1 : 0) },
  // hard
  { id: 'win8', tier: 3, name: 'On fire', blurb: 'Win 8 matches with friends', target: 8, take: (e) => (friendWin(e) ? 1 : 0) },
  { id: 'wins4', tier: 3, name: 'All-rounder', blurb: 'Win at 4 different games', target: 4, take: (e) => friendWin(e)?.game ?? 0 },
  { id: 'streak3', tier: 3, name: 'Hat-trick', blurb: 'Win 3 in a row against the same friend', target: 1, take: (e) => ((friendWin(e)?.streak ?? 0) >= 3 ? 1 : 0) },
  { id: 'opshard3', tier: 3, name: 'Ops slayer', blurb: 'Beat Ops on Hard at 3 different games', target: 3, take: (e) => (e.k === 'match' && opsWin(e)?.ops === 'hard' ? e.game : 0) },
  { id: 'games6', tier: 3, name: 'Explorer', blurb: 'Play 6 different games with friends', target: 6, take: (e) => friend(e)?.game ?? 0 },
]

/* ── the week ── */

const DAY = 864e5
/** weeks since the epoch, turning over on Monday 00:00 UTC (1 Jan 1970 was a Thursday) */
export const weekOf = (t = Date.now()) => Math.floor((t / DAY + 3) / 7)
export const weekEnds = (week: number) => ((week + 1) * 7 - 3) * DAY

/** a fixed shuffle of `n` items for this seed */
function shuffled(n: number, seed: number) {
  const out = Array.from({ length: n }, (_, i) => i)
  let s = (seed * 2654435761) >>> 0 || 1
  for (let i = n - 1; i > 0; i--) {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * This week's three, easy to hard: each tier goes round its whole pool in a fixed shuffled order
 * before repeating (the tiers' pools differ in size, so the three rarely line up the same way).
 */
export function missionsFor(week: number): Mission[] {
  return ([1, 2, 3] as Tier[]).map((tier) => {
    const pool = POOL.filter((m) => m.tier === tier)
    return pool[shuffled(pool.length, tier)[week % pool.length]]
  })
}

/** "3 days", "5 hours", "20 min" */
export function timeLeft(week: number, now = Date.now()) {
  const ms = Math.max(0, weekEnds(week) - now)
  const d = Math.floor(ms / DAY)
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'}`
  const h = Math.floor(ms / 36e5)
  if (h >= 1) return `${h} hour${h === 1 ? '' : 's'}`
  return `${Math.max(1, Math.round(ms / 6e4))} min`
}

/* ── storage ── */

interface Stored {
  w: number
  n?: Record<string, number>
  s?: Record<string, Record<string, true>>
  got?: Record<string, true>
}
interface WalletLike {
  chips?: number
  missions?: Stored
  [k: string]: unknown
}

export interface MissionView {
  m: Mission
  n: number
  done: boolean
  got: boolean
}
export interface WeekView {
  week: number
  list: MissionView[]
  /** the bonus: ready once all three are collected */
  bonus: { ready: boolean; got: boolean }
  /** how many can be collected now */
  waiting: number
}

function viewOf(week: number, st: Stored | null | undefined): WeekView {
  const cur = st && st.w === week ? st : null
  const list = missionsFor(week).map((m) => {
    const n = Math.min(m.target, cur?.n?.[m.id] ?? 0)
    return { m, n, done: n >= m.target, got: !!cur?.got?.[m.id] }
  })
  const bonusGot = !!cur?.got?.[BONUS_ID]
  const bonusReady = list.every((x) => x.got)
  const waiting = list.filter((x) => x.done && !x.got).length + (bonusReady && !bonusGot ? 1 : 0)
  return { week, list, bonus: { ready: bonusReady, got: bonusGot }, waiting }
}

/* ── what the last match moved, for the results screen ── */

export interface Moved {
  id: string
  name: string
  n: number
  target: number
  /** finished just now */
  done: boolean
  reward: number
  at: number
}
let moved: Moved[] = []
const listeners = new Set<() => void>()
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}

/** Missions moved on since `since` (the results screen's first render). */
export function useMoved(since: number) {
  const all = useSyncExternalStore(subscribe, () => moved)
  return all.filter((x) => x.at >= since)
}

/**
 * Counts something towards this week's missions: a match (from payOut), or a throw, sticker,
 * taunt, Ultimate or voice note sent in an online match with friends. Only writes when one of this
 * week's three wants it.
 */
export function mission(e: MissionEvent) {
  const week = weekOf()
  const wants = missionsFor(week)
    .map((m) => ({ m, v: m.take(e) }))
    .filter((x) => x.v)
  if (!wants.length) return
  const at = Date.now()
  signIn()
    .then(async (uid) => {
      let out: Moved[] = []
      const res = await runTransaction(ref(db, `wallets/${uid}`), (cur: WalletLike | null) => {
        const w: WalletLike = cur ?? { chips: 0 }
        const old = w.missions?.w === week ? w.missions : { w: week }
        const st: Stored = { w: week, n: { ...old.n }, s: { ...old.s }, got: { ...old.got } }
        out = []
        for (const { m, v } of wants) {
          const before = st.n![m.id] ?? 0
          if (before >= m.target) continue
          let after = before
          if (typeof v === 'string') {
            if (st.s![m.id]?.[v]) continue
            st.s![m.id] = { ...st.s![m.id], [v]: true }
            after = Object.keys(st.s![m.id]).length
          } else after = Math.min(m.target, before + v)
          st.n![m.id] = after
          out.push({ id: m.id, name: m.name, n: after, target: m.target, done: after >= m.target, reward: REWARD[m.tier], at })
        }
        if (!out.length) return
        return { ...w, chips: w.chips ?? 0, missions: st }
      }, { applyLocally: false })
      if (res.committed && out.length) {
        moved = [...moved.filter((x) => at - x.at < 60_000), ...out]
        listeners.forEach((f) => f())
      }
    })
    .catch(() => {})
}

/** This week's missions and my progress, live (null until known). Rolls over when the week ends. */
export function useMissions(): WeekView | null {
  const [st, setSt] = useState<Stored | null | undefined>(undefined)
  const [week, setWeek] = useState(weekOf)
  useEffect(() => {
    const t = setTimeout(() => setWeek(weekOf()), Math.min(weekEnds(week) - Date.now() + 1000, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [week])
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    signIn()
      .then((uid) => {
        if (!alive) return
        stop = onValue(
          ref(db, `wallets/${uid}/missions`),
          (s) => setSt((s.val() as Stored | null) ?? null),
          () => setSt(null),
        )
      })
      .catch(() => setSt(null))
    return () => {
      alive = false
      stop?.()
    }
  }, [])
  return st === undefined ? null : viewOf(week, st)
}

/** Collects a finished mission's chips (or the bonus). Returns what it paid, 0 if nothing. */
export async function collect(id: string): Promise<number> {
  const week = weekOf()
  const m = POOL.find((x) => x.id === id)
  const reward = id === BONUS_ID ? BONUS : m ? REWARD[m.tier] : 0
  if (!reward) return 0
  try {
    const uid = await signIn()
    const at = ref(db, `wallets/${uid}`)
    await get(at)
    let paid = false
    const res = await runTransaction(at, (cur: WalletLike | null) => {
      paid = false
      // the first pass can see an empty cache: hand it back unchanged and the server retries with the real wallet
      if (!cur) return cur
      const st = cur.missions
      if (!st || st.w !== week || st.got?.[id]) return
      const v = viewOf(week, st)
      const ok = id === BONUS_ID ? v.bonus.ready : v.list.some((x) => x.m.id === id && x.done)
      if (!ok) return
      paid = true
      return { ...cur, chips: (cur.chips ?? 0) + reward, missions: { ...st, got: { ...st.got, [id]: true } } }
    }, { applyLocally: false }) // or the screen flickers through the placeholder
    return res.committed && paid ? reward : 0
  } catch {
    return 0
  }
}
