import {
  get,
  onDisconnect,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database'
import { db } from '../lib/firebase'
import { playerId } from '../lib/storage'

// Rooms live at rooms/{game}/{code}. Each game gets its own namespace,
// so codes only have to be unique per game.

/** `abandoned`: a player left (or dropped and didn't come back) mid-match — the match is over for both. */
export type RoomStatus = 'waiting' | 'playing' | 'done' | 'abandoned'
export type EndReason = 'left' | 'disconnected'
export type Seat = 0 | 1

export interface Player {
  name: string
  seat: Seat
  online: boolean
  joinedAt: number
}

export interface Room {
  game: string
  code: string
  status: RoomStatus
  hostId: string
  createdAt: number
  /** server time the match (or latest rematch) was started */
  startedAt?: number
  players: Record<string, Player>
  /** game-specific state lives under here */
  state?: Record<string, unknown>
  /** set when status is `abandoned` */
  leftBy?: string
  endReason?: EndReason
  /** server time the match was abandoned */
  endedAt?: number
}

/** `you*` / `opp*`: the match ended and this player was in it — they get wording about who ended it. */
export type JoinFailure =
  | 'missing' | 'started' | 'full' | 'ended' | 'offline'
  | 'youLeft' | 'youDropped' | 'oppLeft' | 'oppDropped'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O — easy to read aloud
export const CODE_LENGTH = 4

export const roomPath = (game: string, code: string) => `rooms/${game}/${code}`
const roomRef = (game: string, code: string) => ref(db, roomPath(game, code))

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH)
}

export function inviteUrl(game: string, code: string) {
  return `${location.origin}/${game}?room=${code}`
}

export function playersBySeat(room: Room): [(Player & { id: string }) | null, (Player & { id: string }) | null] {
  const seats: [(Player & { id: string }) | null, (Player & { id: string }) | null] = [null, null]
  Object.entries(room.players ?? {}).forEach(([id, p]) => {
    seats[p.seat] = { ...p, id }
  })
  return seats
}

/** Creates a fresh room with the caller in seat 0 and returns its code. */
export async function createRoom(game: string, name: string): Promise<string> {
  const pid = playerId()
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode()
    const r = roomRef(game, code)
    const existing = await get(r)
    if (existing.exists()) continue
    await set(r, {
      game,
      code,
      status: 'waiting',
      hostId: pid,
      createdAt: serverTimestamp(),
      players: {
        [pid]: { name, seat: 0, online: true, joinedAt: serverTimestamp() },
      },
    })
    return code
  }
  throw new Error('Could not find a free room code')
}

/** Read-only check used to validate an invite link before asking for a name. */
export async function peekRoom(game: string, code: string): Promise<{ room: Room } | { error: JoinFailure }> {
  try {
    const snap = await get(roomRef(game, code))
    const room = snap.val() as Room | null
    if (!room) return { error: 'missing' }
    const pid = playerId()
    if (room.status === 'abandoned') {
      const dropped = room.endReason === 'disconnected'
      if (room.leftBy === pid) return { error: dropped ? 'youDropped' : 'youLeft' }
      if (room.players?.[pid]) return { error: dropped ? 'oppDropped' : 'oppLeft' }
      return { error: 'ended' }
    }
    if (room.players?.[pid]) return { room } // rejoining my own seat
    if (room.status !== 'waiting') return { error: 'started' }
    if (Object.keys(room.players ?? {}).length >= 2) return { error: 'full' }
    return { room }
  } catch {
    return { error: 'offline' }
  }
}

/** Atomically claims the free seat (or reclaims ours). */
export async function joinRoom(game: string, code: string, name: string): Promise<{ ok: true } | { ok: false; error: JoinFailure }> {
  const pid = playerId()
  let reason: JoinFailure = 'missing'
  try {
    const result = await runTransaction(roomRef(game, code), (room: Room | null) => {
      // First pass may run against an empty local cache — returning null lets the server retry with real data.
      if (!room) return null
      if (room.status === 'abandoned') {
        reason = 'ended'
        return undefined
      }
      const players = room.players ?? {}
      if (players[pid]) {
        players[pid] = { ...players[pid], name, online: true }
        return { ...room, players }
      }
      if (room.status !== 'waiting') {
        reason = 'started'
        return undefined
      }
      const taken = new Set(Object.values(players).map((p) => p.seat))
      const seat: Seat | undefined = !taken.has(0) ? 0 : !taken.has(1) ? 1 : undefined
      if (seat === undefined) {
        reason = 'full'
        return undefined
      }
      players[pid] = { name, seat, online: true, joinedAt: Date.now() }
      return { ...room, players }
    })
    if (result.committed && result.snapshot.exists()) return { ok: true }
    return { ok: false, error: result.snapshot.exists() ? reason : 'missing' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

/** Marks us online and arranges for "offline" to be written if the tab drops. */
export function trackPresence(game: string, code: string) {
  const onlineRef = ref(db, `${roomPath(game, code)}/players/${playerId()}/online`)
  set(onlineRef, true).catch(() => {})
  onDisconnect(onlineRef).set(false).catch(() => {})
  return () => {
    // Navigating away inside the app doesn't drop the socket, so mark ourselves offline explicitly.
    onDisconnect(onlineRef).cancel().catch(() => {})
    // Transaction so we never recreate a seat (or a whole room) that was just removed.
    runTransaction(ref(db, `${roomPath(game, code)}/players/${playerId()}`), (p: Player | null) =>
      // null on null: a no-op if the seat is gone, and lets the server retry if our cache was just empty
      p ? { ...p, online: false } : null,
    ).catch(() => {})
  }
}

export async function startMatch(game: string, code: string, state: Record<string, unknown> = {}) {
  await update(roomRef(game, code), { status: 'playing', startedAt: serverTimestamp(), state })
}

/**
 * Leaving a room:
 * - waiting room: the host closes it; a guest just gives up their seat
 * - live match: ends it for both players (status `abandoned`) so nobody is left sitting in a dead game
 * - already abandoned: the last one out deletes it
 */
export async function leaveRoom(game: string, room: Room) {
  const pid = playerId()
  const r = roomRef(game, room.code)
  try {
    if (room.status === 'waiting') {
      if (room.hostId === pid) await remove(r)
      else await remove(ref(db, `${roomPath(game, room.code)}/players/${pid}`))
    } else if (room.status === 'abandoned') {
      await remove(r)
    } else {
      await abandonRoom(game, room.code, pid, 'left')
    }
  } catch {
    /* best effort */
  }
}

/** Ends a live match for both players. Transaction so two near-simultaneous exits don't overwrite each other. */
export async function abandonRoom(game: string, code: string, who: string, reason: EndReason) {
  await runTransaction(roomRef(game, code), (room: Room | null) => {
    if (!room) return null
    if (room.status === 'abandoned' || room.status === 'waiting') return undefined
    const players = room.players ?? {}
    if (players[who]) players[who] = { ...players[who], online: false }
    return { ...room, players, status: 'abandoned', leftBy: who, endReason: reason, endedAt: Date.now() }
  })
}
