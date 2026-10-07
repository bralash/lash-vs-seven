import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database'
import { db, playerId } from '../lib/firebase'
import { load, save } from '../lib/storage'

// Rooms live at matches/{game}/{code}. Each game gets its own namespace, so codes only
// have to be unique per game. (The old site still uses rooms/, wh-rooms/ etc. — left untouched.)
//
// Every write below targets the smallest piece the database rules allow for the caller
// (see database.rules.json): a seat, your own player entry, your own words, a status flip.

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
  /** who holds each seat; claiming s1 is how a guest joins */
  seats?: { s0?: string; s1?: string }
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
/** Rooms older than this get cleaned up by the browser that created them. */
const STALE_MS = 24 * 60 * 60 * 1000

export const roomPath = (game: string, code: string) => `matches/${game}/${code}`
const roomRef = (game: string, code: string) => ref(db, roomPath(game, code))
const at = (game: string, code: string, rest: string) => ref(db, `${roomPath(game, code)}/${rest}`)

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
  cleanUpMyOldRooms() // housekeeping, fire-and-forget
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode()
    const existing = await get(roomRef(game, code))
    if (existing.exists()) continue
    await set(roomRef(game, code), {
      game,
      code,
      status: 'waiting',
      hostId: pid,
      createdAt: serverTimestamp(),
      seats: { s0: pid },
      players: {
        [pid]: { name, seat: 0, online: true, joinedAt: serverTimestamp() },
      },
    })
    rememberRoom(game, code)
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
    if (room.seats?.s1) return { error: 'full' }
    return { room }
  } catch {
    return { error: 'offline' }
  }
}

/**
 * Takes the guest seat (or reclaims ours after a refresh).
 * Claiming `seats/s1` is a transaction, so two people opening the same link can't both get in.
 */
export async function joinRoom(game: string, code: string, name: string): Promise<{ ok: true } | { ok: false; error: JoinFailure }> {
  const pid = playerId()
  try {
    const snap = await get(roomRef(game, code))
    const room = snap.val() as Room | null
    if (!room) return { ok: false, error: 'missing' }
    if (room.status === 'abandoned') return { ok: false, error: 'ended' }

    // already seated (refresh, or coming back after a drop): just mark ourselves present again
    if (room.players?.[pid]) {
      await update(at(game, code, `players/${pid}`), { name, online: true })
      return { ok: true }
    }
    if (room.status !== 'waiting') return { ok: false, error: 'started' }

    const claim = await runTransaction(at(game, code, 'seats/s1'), (cur: string | null) => (cur ? undefined : pid))
    if (!claim.committed) return { ok: false, error: 'full' }
    await set(at(game, code, `players/${pid}`), { name, seat: 1, online: true, joinedAt: serverTimestamp() })
    return { ok: true }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

/** Marks us online and arranges for "offline" to be written if the tab drops. */
export function trackPresence(game: string, code: string) {
  const onlineRef = at(game, code, `players/${playerId()}/online`)
  // Every time the connection comes up — including after the phone was locked or the player
  // switched apps to share the link — re-arm "offline when I drop" and mark ourselves online again.
  // (Doing this only once left a returning player stuck as away, and the match then ended on them.)
  const stop = onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return
    onDisconnect(onlineRef)
      .set(false)
      .then(() =>
        // only touch a seat that still exists — never recreate one in a room that closed while we were away
        runTransaction(at(game, code, `players/${playerId()}`), (p: Player | null) => (p ? { ...p, online: true } : null)),
      )
      .catch(() => {})
  })
  return () => {
    stop()
    // Navigating away inside the app doesn't drop the socket, so mark ourselves offline explicitly.
    onDisconnect(onlineRef).cancel().catch(() => {})
    // Transaction so we never recreate a seat (or a whole room) that was just removed.
    runTransaction(at(game, code, `players/${playerId()}`), (p: Player | null) =>
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
  try {
    if (room.status === 'waiting') {
      if (room.hostId === pid) await remove(roomRef(game, room.code))
      else await update(roomRef(game, room.code), { [`players/${pid}`]: null, 'seats/s1': null })
    } else if (room.status === 'abandoned') {
      await remove(roomRef(game, room.code))
    } else {
      await abandonRoom(game, room.code, pid, 'left')
    }
  } catch {
    /* best effort */
  }
}

/** Ends a live match for both players. The rules make `abandoned` final, so a second exit can't undo it. */
export async function abandonRoom(game: string, code: string, who: string, reason: EndReason) {
  const me = playerId()
  await update(roomRef(game, code), {
    status: 'abandoned',
    leftBy: who,
    endReason: reason,
    endedAt: serverTimestamp(),
    // we can only touch our own entry; a dropped opponent is already marked offline by their disconnect hook
    ...(who === me ? { [`players/${me}/online`]: false } : {}),
  })
}

/* ── Housekeeping ──────────────────────────────────────────────────────
 * The rules don't allow listing rooms (that would expose live room codes), so there's no global
 * sweep. Instead each browser remembers the rooms it created and, next time it makes one,
 * deletes any that are over a day old. The rules allow anyone to delete a room that old. */

const MINE_KEY = 'lvs_my_rooms'

interface MyRoom {
  game: string
  code: string
  at: number
}

function myRooms(): MyRoom[] {
  try {
    const list = JSON.parse(load(MINE_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function rememberRoom(game: string, code: string) {
  save(MINE_KEY, JSON.stringify([...myRooms(), { game, code, at: Date.now() }].slice(-50)))
}

async function cleanUpMyOldRooms() {
  const now = Date.now()
  const all = myRooms()
  // a little margin over a day so a slightly fast device clock can't ask before the rules allow it
  const old = all.filter((r) => now - r.at > STALE_MS + 10 * 60 * 1000)
  if (!old.length) return
  save(MINE_KEY, JSON.stringify(all.filter((r) => !old.includes(r))))
  await Promise.all(old.map((r) => remove(roomRef(r.game, r.code)).catch(() => {})))
}
