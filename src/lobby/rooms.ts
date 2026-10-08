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
import type { Stake } from '../match/stakes'
import { pickedOpsLook, type OpsStyle } from '../components/OpsFace'

// Rooms live at matches/{game}/{code}. Each game gets its own namespace, so codes only
// have to be unique per game. (The old site still uses rooms/, wh-rooms/ etc. — left untouched.)
//
// Every write below targets the smallest piece the database rules allow for the caller
// (see database.rules.json): a seat, your own player entry, your own words, a status flip.

/** `abandoned`: a player left (or dropped and didn't come back) mid-match and fewer than two were left — the match is over. */
export type RoomStatus = 'waiting' | 'playing' | 'done' | 'abandoned'
export type EndReason = 'left' | 'disconnected'
/** the two seats of a two-player game */
export type Seat = 0 | 1
/** any seat, in games for up to four */
export type AnySeat = 0 | 1 | 2 | 3
/** how a player came to be out of a match that carried on without them */
export type OutReason = 'left' | 'dropped'

export interface Player {
  name: string
  seat: AnySeat
  online: boolean
  joinedAt: number
  /** the Ops face they picked in Ops' room, shown on their score card (missing: they never picked) */
  look?: OpsStyle
}

export interface Room {
  game: string
  code: string
  status: RoomStatus
  hostId: string
  createdAt: number
  /** how many seats the room has: 2, or up to 4 in games for more (missing on two-seat rooms) */
  seatCount?: number
  /** who holds each seat; claiming a free one is how a guest joins */
  seats?: { s0?: string; s1?: string; s2?: string; s3?: string }
  /** players a 3–4 player match carried on without, by id */
  out?: Record<string, OutReason>
  /** server time the match (or latest rematch) was started */
  startedAt?: number
  players: Record<string, Player>
  /** what the room plays for, if the host turned stakes on */
  stake?: Stake
  /** who has agreed to the stake, by id: the stake text they agreed to */
  stakeOk?: Record<string, string>
  /** players who pressed Leave in a staked match, by id: the startedAt of the match they left */
  stakeLeft?: Record<string, number>
  /** the startedAt of the latest match whose stake was settled (it reached its result) */
  stakeDone?: number
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

/** my Ops pick for my room entry, if I made one */
const myLook = () => {
  const look = pickedOpsLook()
  return look ? { look } : {}
}

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
    if (p.seat < 2) seats[p.seat as Seat] = { ...p, id }
  })
  return seats
}

export const seatCountOf = (room: Room) => room.seatCount ?? 2

/** Every seat of the room in order, empty ones as null — for games for up to four. */
export function seatedPlayers(room: Room): ((Player & { id: string }) | null)[] {
  const seats: ((Player & { id: string }) | null)[] = Array.from({ length: seatCountOf(room) }, () => null)
  Object.entries(room.players ?? {}).forEach(([id, p]) => {
    if (p.seat < seats.length) seats[p.seat] = { ...p, id }
  })
  return seats
}

/** The players still in the match: seated, and not left or dropped out. */
export const stillIn = (room: Room) => seatedPlayers(room).filter((p): p is Player & { id: string } => !!p && !room.out?.[p.id])

const freeSeats = (room: Room) =>
  Array.from({ length: seatCountOf(room) - 1 }, (_, i) => (i + 1) as AnySeat).filter((s) => !room.seats?.[`s${s}`])

/** Creates a fresh room with the caller in seat 0 and returns its code. `seats`: how many can play (2–4). */
export async function createRoom(game: string, name: string, seats = 2): Promise<string> {
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
      ...(seats > 2 ? { seatCount: seats } : {}),
      seats: { s0: pid },
      players: {
        [pid]: { name, seat: 0, online: true, joinedAt: serverTimestamp(), ...myLook() },
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
    // the match carried on without me
    if (room.out?.[pid]) return { error: room.out[pid] === 'dropped' ? 'youDropped' : 'youLeft' }
    if (room.players?.[pid]) return { room } // rejoining my own seat
    if (room.status !== 'waiting') return { error: 'started' }
    if (!freeSeats(room).length) return { error: 'full' }
    return { room }
  } catch {
    return { error: 'offline' }
  }
}

/**
 * Takes the first free guest seat (or reclaims ours after a refresh).
 * Claiming a seat is a transaction, so two people opening the same link can't both get the same one.
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
      await update(at(game, code, `players/${pid}`), { name, online: true, look: pickedOpsLook() })
      return { ok: true }
    }
    if (room.status !== 'waiting') return { ok: false, error: 'started' }

    // someone may take a seat between our read and our claim: then try the next one
    for (const seat of freeSeats(room)) {
      const claim = await runTransaction(at(game, code, `seats/s${seat}`), (cur: string | null) => (cur ? undefined : pid))
      if (!claim.committed) continue
      await set(at(game, code, `players/${pid}`), { name, seat, online: true, joinedAt: serverTimestamp(), ...myLook() })
      return { ok: true }
    }
    return { ok: false, error: 'full' }
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
  let connected = false
  // only touch a seat that still exists — never recreate one in a room that closed while we were away
  const markOnline = () =>
    runTransaction(at(game, code, `players/${playerId()}`), (p: Player | null) => (p ? { ...p, online: true } : null)).catch(() => {})
  const stop = onValue(ref(db, '.info/connected'), (snap) => {
    connected = snap.val() === true
    if (!connected) return
    onDisconnect(onlineRef)
      .set(false)
      .then(markOnline)
      .catch(() => {})
  })
  // A quick drop and reconnect (a blip on mobile data, the phone locked for a moment) can leave the
  // server still holding the old connection. When it finally times that one out, its "offline" lands
  // AFTER we've marked ourselves back online, and the other player sees us as gone while we're still
  // here. So whenever the room says we're offline while we're connected, put it right.
  const stopSelf = onValue(onlineRef, (snap) => {
    if (!connected || snap.val() !== false) return
    onDisconnect(onlineRef).set(false).catch(() => {})
    markOnline()
  })
  return () => {
    stop()
    stopSelf()
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

/** The host sets (or, with null, clears) the stake. Everyone has to agree again. */
export async function setStake(game: string, code: string, stake: Stake | null) {
  await update(roomRef(game, code), { stake, stakeOk: null })
}

/** Agree to the room's stake as it reads now. */
export async function acceptStake(game: string, code: string, text: string) {
  await set(at(game, code, `stakeOk/${playerId()}`), text)
}

/** Everyone seated has agreed to the stake as it reads now (or there's no stake). */
export const stakeAgreed = (room: Room) =>
  !room.stake || seatedPlayers(room).every((p) => !p || p.id === room.hostId || room.stakeOk?.[p.id] === room.stake!.text)

/**
 * Leaving a room:
 * - waiting room: the host closes it; a guest just gives up their seat
 * - live match: see dropPlayer — it carries on if two or more are still in, otherwise it's over for everyone
 * - already abandoned: the last one out deletes it
 */
export async function leaveRoom(game: string, room: Room) {
  const pid = playerId()
  try {
    if (room.status === 'waiting') {
      const seat = room.players?.[pid]?.seat ?? 1
      if (room.hostId === pid) await remove(roomRef(game, room.code))
      else await update(roomRef(game, room.code), { [`players/${pid}`]: null, [`seats/s${seat}`]: null })
    } else if (room.status === 'abandoned') {
      await remove(roomRef(game, room.code))
    } else if (!room.out?.[pid]) {
      await dropPlayer(game, room.code, pid, 'left')
    }
  } catch {
    /* best effort */
  }
}

/**
 * A player leaves a live match, or dropped and didn't come back. With two or more still in, the match
 * carries on without them (`out`) and the game deals them out; otherwise it's over (`abandoned`).
 * Reads the room fresh, so phones acting on a stale copy can't miscount who's left.
 */
export async function dropPlayer(game: string, code: string, who: string, reason: EndReason) {
  const room = (await get(roomRef(game, code))).val() as Room | null
  if (!room || room.status !== 'playing' || room.out?.[who]) return
  const me = playerId()
  // pressing Leave in a staked match counts as last; a dropped connection doesn't
  const staked = reason === 'left' && who === me && room.stake && room.startedAt && room.stakeDone !== room.startedAt ? { [`stakeLeft/${me}`]: room.startedAt } : {}
  if (stillIn(room).filter((p) => p.id !== who).length < 2) return abandonRoom(game, code, who, reason, staked)
  await update(roomRef(game, code), {
    ...staked,
    [`out/${who}`]: reason === 'left' ? 'left' : 'dropped',
    ...(who === me ? { [`players/${me}/online`]: false } : {}),
  })
}

/** Once the host is out of a match that carried on, the next player still in takes over hosting. */
export async function takeOverHost(game: string, code: string) {
  await set(at(game, code, 'hostId'), playerId())
}

/** Ends a live match for both players. The rules make `abandoned` final, so a second exit can't undo it. */
export async function abandonRoom(game: string, code: string, who: string, reason: EndReason, extra: Record<string, unknown> = {}) {
  const me = playerId()
  await update(roomRef(game, code), {
    ...extra,
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

/** Calls `fn` with whether this device is connected to the database (false while offline or reconnecting). */
export function watchConnected(fn: (up: boolean) => void) {
  return onValue(ref(db, '.info/connected'), (snap) => fn(snap.val() === true))
}
