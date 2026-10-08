import type { Seat } from '../../lobby/rooms'

/**
 * Battleship on a 10×10 grid, five ships (they may touch), one shot per turn whatever it hits.
 *
 * A fleet never goes into the shared room. Its owner's device keeps it and *answers* each shot
 * (the shooter posts `pending`, the owner's device records miss / hit / sunk). When a fleet is
 * locked in, the owner publishes `commit` = SHA-256 of "layout:salt"; when the game ends both
 * fleets are revealed, and each device checks the other's against the commitment and every answer.
 */
export const SIZE = 10
export const CELLS = SIZE * SIZE

export const FLEET = [
  { id: 'carrier', name: 'Carrier', len: 5 },
  { id: 'battleship', name: 'Battleship', len: 4 },
  { id: 'cruiser', name: 'Cruiser', len: 3 },
  { id: 'submarine', name: 'Submarine', len: 3 },
  { id: 'destroyer', name: 'Destroyer', len: 2 },
] as const
export type ShipId = (typeof FLEET)[number]['id']
export const shipName = (id: string) => FLEET.find((s) => s.id === id)?.name ?? id

/** A ship by where its first square is and which way it runs. */
export interface Placed {
  id: ShipId
  at: number
  down: boolean
}
/** Five ships, in FLEET order. */
export type Layout = Placed[]

export interface Sunk {
  id: ShipId
  cells: number[]
}

/** One player's waters, as everyone sees them. (The database drops empty arrays — read with `?? []`.) */
export interface Waters {
  /** SHA-256 of "layout:salt", published when the fleet is locked in */
  commit?: string
  /** every square shot at, in order */
  shots?: number[]
  /** the shots that hit */
  hits?: number[]
  sunk?: Sunk[]
  /** a shot the owner's device hasn't answered yet */
  pending?: number
  /** revealed when the game ends */
  layout?: string
  salt?: string
}

export interface Live {
  /** 1 = a single game, 3 = best of three */
  best: 1 | 3
  /** this game within the match (0-based) */
  game: number
  /** who fires first this game */
  starter: Seat
  phase: 'placing' | 'firing' | 'done'
  /** whose shot it is (on a shared device, whose hands the phone is in) */
  turn: Seat
  /** each player's own waters, by seat */
  waters: [Waters, Waters]
  /** games won so far */
  wins: [number, number]
  /** who took the game that just ended */
  winner?: Seat
  forfeit?: boolean
  /** every finished game of this match, oldest first */
  played?: GameLog[]
}

export interface GameLog {
  winner: Seat
  forfeit?: boolean
  /** by seat: how each player shot at the other */
  shots: [number, number]
  hits: [number, number]
  run: [number, number]
  /** ships each player sank (missing on games logged before it was kept) */
  sank?: [number, number]
}

const other = (s: Seat) => (1 - s) as Seat
const row = (i: number) => Math.floor(i / SIZE)
const col = (i: number) => i % SIZE

export function freshLive(best: 1 | 3, starter: Seat): Live {
  return { best, game: 0, starter, phase: 'placing', turn: starter, waters: [{}, {}], wins: [0, 0] }
}

/** The database drops empty objects (a fresh game's seas) and may hand back one sea as `{ 1: … }`: fill them back in. */
export function norm(live: Live): Live {
  const w = live.waters as unknown as Record<number, Waters | undefined> | undefined
  return { ...live, waters: [w?.[0] ?? {}, w?.[1] ?? {}], wins: live.wins ?? [0, 0] }
}

/* ── Fleets ─────────────────────────────────────────────────────────── */

const lenOf = (id: ShipId) => FLEET.find((s) => s.id === id)!.len

/** The squares a ship covers, or null if it runs off the board. */
export function cellsOf(p: Placed): number[] | null {
  const len = lenOf(p.id)
  if (p.at < 0 || p.at >= CELLS) return null
  if (p.down ? row(p.at) + len > SIZE : col(p.at) + len > SIZE) return null
  return Array.from({ length: len }, (_, k) => p.at + k * (p.down ? SIZE : 1))
}

/** Every ship on the board, none overlapping, one of each in FLEET order. Ships may touch. */
export function legal(layout: Layout): boolean {
  if (layout.length !== FLEET.length || layout.some((p, k) => p.id !== FLEET[k].id)) return false
  const taken = new Set<number>()
  for (const p of layout) {
    const cells = cellsOf(p)
    if (!cells) return false
    for (const c of cells) {
      if (taken.has(c)) return false
      taken.add(c)
    }
  }
  return true
}

/** Can `p` go here, given the rest of the fleet? */
export function fits(layout: Layout, p: Placed): boolean {
  const cells = cellsOf(p)
  if (!cells) return false
  const taken = new Set(layout.filter((q) => q.id !== p.id).flatMap((q) => cellsOf(q) ?? []))
  return cells.every((c) => !taken.has(c))
}

export function randomLayout(rand: () => number = Math.random): Layout {
  for (;;) {
    const layout: Layout = []
    let ok = true
    for (const s of FLEET) {
      let placed = false
      for (let t = 0; t < 200 && !placed; t++) {
        const p: Placed = { id: s.id, at: Math.floor(rand() * CELLS), down: rand() < 0.5 }
        if (fits(layout, p)) {
          layout.push(p)
          placed = true
        }
      }
      if (!placed) ok = false
    }
    if (ok) return layout
  }
}

/** "carrier@12h,battleship@40v,…" — what gets committed to and revealed. */
export const encode = (layout: Layout) => layout.map((p) => `${p.id}@${p.at}${p.down ? 'v' : 'h'}`).join(',')

export function decode(s: string): Layout | null {
  const parts = s.split(',')
  const layout: Layout = []
  for (const part of parts) {
    const m = /^([a-z]+)@(\d{1,2})([hv])$/.exec(part)
    if (!m) return null
    layout.push({ id: m[1] as ShipId, at: Number(m[2]), down: m[3] === 'v' })
  }
  return legal(layout) ? layout : null
}

/* ── Moves ──────────────────────────────────────────────────────────── */

/** A player locks their fleet in: only the commitment goes public. Firing starts once both have. */
export function lock(live: Live, seat: Seat, commit: string): Live | undefined {
  live = norm(live)
  if (live.phase !== 'placing' || live.waters[seat].commit) return undefined
  const waters = [...live.waters] as [Waters, Waters]
  waters[seat] = { commit }
  const both = !!waters[0].commit && !!waters[1].commit
  return { ...live, waters, ...(both ? { phase: 'firing' as const, turn: live.starter } : {}) }
}

/** The player on turn fires at a square of the other's waters. It waits until their device answers. */
export function fire(live: Live, seat: Seat, cell: number): Live | undefined {
  live = norm(live)
  const target = other(seat)
  const w = live.waters[target]
  if (live.phase !== 'firing' || live.turn !== seat || w.pending !== undefined) return undefined
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS || (w.shots ?? []).includes(cell)) return undefined
  return withWaters(live, target, { ...w, pending: cell })
}

/** The owner's device answers the shot at its waters. A hit doesn't earn another shot. */
export function answer(live: Live, owner: Seat, layout: Layout, salt: string): Live | undefined {
  live = norm(live)
  const w = live.waters[owner]
  if (live.phase !== 'firing' || w.pending === undefined || live.turn !== other(owner)) return undefined
  const cell = w.pending
  const ship = layout.find((p) => cellsOf(p)!.includes(cell))
  const { pending: _p, ...rest } = w
  const next: Waters = { ...rest, shots: [...(w.shots ?? []), cell] }
  if (ship) {
    const hits = [...(w.hits ?? []), cell]
    next.hits = hits
    const cells = cellsOf(ship)!
    if (cells.every((c) => hits.includes(c))) next.sunk = [...(w.sunk ?? []), { id: ship.id, cells }]
  }
  if ((next.sunk ?? []).length === FLEET.length) {
    // every ship down: the game's over, and this fleet is shown
    next.layout = encode(layout)
    next.salt = salt
    return endGame(withWaters(live, owner, next), other(owner), false)
  }
  return { ...withWaters(live, owner, next), turn: owner }
}

/** A player can't answer (their fleet isn't on this device any more) — they give up this game. */
export function concede(live: Live, seat: Seat): Live | undefined {
  live = norm(live)
  if (live.phase === 'done') return undefined
  const w = live.waters[seat]
  const { pending: _p, ...rest } = w
  return endGame(withWaters(live, seat, rest), other(seat), true)
}

/** The winner's fleet is shown too, once the game is over. */
export function reveal(live: Live, seat: Seat, layout: Layout, salt: string): Live | undefined {
  live = norm(live)
  if (live.phase !== 'done' || live.waters[seat].layout) return undefined
  return withWaters(live, seat, { ...live.waters[seat], layout: encode(layout), salt })
}

function endGame(live: Live, winner: Seat, forfeit: boolean): Live {
  const wins = [...live.wins] as [number, number]
  wins[winner]++
  // seat 0 shot at seat 1's waters, and the other way round
  const by = [shooting(live.waters[1]), shooting(live.waters[0])]
  const log: GameLog = {
    winner,
    shots: [by[0].shots, by[1].shots],
    hits: [by[0].hits, by[1].hits],
    run: [by[0].run, by[1].run],
    sank: [(live.waters[1].sunk ?? []).length, (live.waters[0].sunk ?? []).length],
  }
  if (forfeit) log.forfeit = true
  return { ...live, phase: 'done', winner, wins, played: [...(live.played ?? []), log], ...(forfeit ? { forfeit } : {}) }
}

export const needed = (best: 1 | 3) => (best === 1 ? 1 : 2)
export const matchOver = (live: Live) => live.phase === 'done' && Math.max(...(live.wins ?? [0, 0])) >= needed(live.best)
export const matchWinner = (live: Live): Seat | -1 => (!matchOver(live) ? -1 : live.wins[0] > live.wins[1] ? 0 : 1)

/** On to the next game of a best of three: new fleets, and the other player fires first. */
export function nextGame(live: Live): Live | undefined {
  live = norm(live)
  if (live.phase !== 'done' || matchOver(live)) return undefined
  const starter = other(live.starter)
  return { best: live.best, game: live.game + 1, starter, phase: 'placing', turn: starter, waters: [{}, {}], wins: live.wins, played: live.played ?? [] }
}

function withWaters(live: Live, seat: Seat, w: Waters): Live {
  const waters = [...live.waters] as [Waters, Waters]
  waters[seat] = w
  return { ...live, waters }
}

/* ── Stats ──────────────────────────────────────────────────────────── */

/** How a player shot at the other's waters: shots, hits, and the longest run of hits in a row. */
export function shooting(target: Waters) {
  const shots = target.shots ?? []
  const hits = new Set(target.hits ?? [])
  let run = 0
  let best = 0
  for (const s of shots) {
    run = hits.has(s) ? run + 1 : 0
    best = Math.max(best, run)
  }
  return { shots: shots.length, hits: hits.size, run: best, rate: shots.length ? Math.round((hits.size / shots.length) * 100) : 0 }
}

/* ── The commitment ─────────────────────────────────────────────────── */

export async function commitOf(layout: string, salt: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${layout}:${salt}`))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function newSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Was this fleet's owner honest? The revealed layout must be a legal fleet, match the commitment,
 * and fit every answer given: each hit on a ship, each miss on open water, each sinking exactly a
 * ship's squares, and no ship fully hit without being called sunk.
 */
export async function verify(w: Waters): Promise<boolean> {
  if (!w.layout || !w.salt || !w.commit) return true // nothing revealed (a concession) — nothing to check
  if ((await commitOf(w.layout, w.salt)) !== w.commit) return false
  const layout = decode(w.layout)
  if (!layout) return false
  const shipAt = new Map<number, ShipId>()
  for (const p of layout) for (const c of cellsOf(p)!) shipAt.set(c, p.id)
  const hits = new Set(w.hits ?? [])
  for (const s of w.shots ?? []) if (shipAt.has(s) !== hits.has(s)) return false
  const sunk = new Map((w.sunk ?? []).map((s) => [s.id, s.cells]))
  for (const p of layout) {
    const cells = cellsOf(p)!
    const allHit = cells.every((c) => hits.has(c))
    const said = sunk.get(p.id)
    if (allHit !== !!said) return false
    if (said && said.join() !== cells.join()) return false
  }
  return true
}
