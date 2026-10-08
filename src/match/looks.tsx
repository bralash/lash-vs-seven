import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import { OPS_STYLES, type OpsMood, type OpsStyle } from '../components/OpsFace'
import type { Room } from '../lobby/rooms'

/**
 * The Ops each player wears on their score card. Someone who picked a face in Ops' room brings it
 * with them (it's in their room entry); everyone else gets one nobody in the room is wearing. That
 * random pick is seeded by the room, so every phone shows the same faces for the whole match.
 */
export type Looks = Record<string, OpsStyle>

const isLook = (v: unknown): v is OpsStyle => OPS_STYLES.some((s) => s.id === v)

function seeded(seed: string) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** `fixed`: looks that are already decided (Ops' own face, in a game against her). */
export function looksFor(room: Room, fixed: Looks = {}): Looks {
  const players = Object.entries(room.players ?? {}).sort(([, a], [, b]) => a.seat - b.seat)
  const out: Looks = { ...fixed }
  for (const [id, p] of players) if (!out[id] && isLook(p.look)) out[id] = p.look
  const rand = seeded(`${room.game}:${room.code}:${room.createdAt}`)
  const free = OPS_STYLES.map((s) => s.id).filter((l) => !Object.values(out).includes(l))
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[free[i], free[j]] = [free[j], free[i]]
  }
  // five looks and at most four players, so there's always one free
  for (const [id] of players) if (!out[id]) out[id] = free.shift() ?? OPS_STYLES[0].id
  return out
}

const LooksContext = createContext<Looks>({})
export const LooksProvider = LooksContext.Provider
export const usePlayerLook = (id: string | undefined) => {
  const looks = useContext(LooksContext)
  return id ? looks[id] : undefined
}

/* ── Her mood: how this player is doing against the others on screen ── */

const scores = new Map<string, number>()
const listeners = new Set<() => void>()
let version = 0
const notify = () => {
  version++
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/**
 * Each score card reports its number; the face grins while that player leads on their own, sulks
 * while they're last, and thinks while it's their go. Cards whose score isn't a plain number stay calm.
 */
export function useScoreMood(id: string | undefined, value: unknown, thinking: boolean): OpsMood {
  const n = typeof value === 'number' ? value : null
  useEffect(() => {
    if (!id || n === null) return
    scores.set(id, n)
    notify()
    return () => {
      if (scores.get(id) === n) scores.delete(id)
      notify()
    }
  }, [id, n])
  useSyncExternalStore(subscribe, () => version)
  if (thinking) return 'think'
  if (n === null || scores.size < 2) return 'idle'
  const all = [...scores.values()]
  const top = Math.max(...all)
  const low = Math.min(...all)
  if (top === low) return 'idle'
  if (n === top) return all.filter((v) => v === top).length === 1 ? 'win' : 'idle'
  return n === low ? 'lose' : 'idle'
}
