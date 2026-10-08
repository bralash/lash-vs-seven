import { BOT_SEAT, pick, squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { CELLS, FLEET, SIZE, fire, matchOver, norm, type Live, type Waters } from './engine'
import type { BattleshipState } from './BattleshipMatch'

/**
 * Ops at Battleship. She only ever reads what the board shows anyone: her shots at your waters,
 * which hit, and which ships went down. Your fleet stays on your side; your device answers her
 * shots exactly as it would a person's.
 *
 * Hard weighs every square by how many ways the ships still afloat could lie across it, given the
 * misses and the wrecks, and once she has a hit, only the ways that run through it. Medium hunts on
 * a checkerboard and finishes ships off the same way Hard does. Easy shoots anywhere and, after a
 * hit, tries the squares around it.
 */
const SLIP: Record<Level, number> = { easy: 0.25, medium: 0.1, hard: 0 }

const row = (i: number) => Math.floor(i / SIZE)
const col = (i: number) => i % SIZE

function neighbours(i: number): number[] {
  const out: number[] = []
  if (row(i) > 0) out.push(i - SIZE)
  if (row(i) < SIZE - 1) out.push(i + SIZE)
  if (col(i) > 0) out.push(i - 1)
  if (col(i) < SIZE - 1) out.push(i + 1)
  return out
}

/** What the shooter knows about a sea. */
function read(w: Waters) {
  const shot = new Set(w.shots ?? [])
  const sunk = w.sunk ?? []
  const wrecked = new Set(sunk.flatMap((s) => s.cells))
  // hits on ships still afloat
  const open = (w.hits ?? []).filter((c) => !wrecked.has(c))
  const afloat = FLEET.filter((s) => !sunk.some((x) => x.id === s.id)).map((s) => s.len)
  const free = Array.from({ length: CELLS }, (_, i) => i).filter((i) => !shot.has(i))
  return { shot, wrecked, open: new Set(open), afloat, free }
}

/**
 * How many ways the ships still afloat could cover each square. A ship can't lie on a miss or a
 * wreck; with hits to chase, only lines through them count, more for each hit they take in.
 */
function density(w: Waters): number[] {
  const { shot, wrecked, open, afloat } = read(w)
  const score = new Array<number>(CELLS).fill(0)
  const chasing = open.size > 0
  for (const len of afloat) {
    for (let at = 0; at < CELLS; at++) {
      for (const down of [false, true]) {
        if (down ? row(at) + len > SIZE : col(at) + len > SIZE) continue
        const cells = Array.from({ length: len }, (_, k) => at + k * (down ? SIZE : 1))
        let hits = 0
        let ok = true
        for (const c of cells) {
          if (wrecked.has(c) || (shot.has(c) && !open.has(c))) {
            ok = false
            break
          }
          if (open.has(c)) hits++
        }
        if (!ok || (chasing && !hits)) continue
        const weight = chasing ? 20 ** hits : 1
        for (const c of cells) if (!shot.has(c)) score[c] += weight
      }
    }
  }
  return score
}

/** The best squares by that count. */
function densest(w: Waters, among?: number[]): number[] {
  const score = density(w)
  const cells = (among ?? read(w).free).filter((c) => score[c] > 0)
  if (!cells.length) return []
  const top = Math.max(...cells.map((c) => score[c]))
  return cells.filter((c) => score[c] === top)
}

/** Where Ops shoots next at these waters. */
export function aim(w: Waters, level: Level): number {
  const { open, free } = read(w)
  if (Math.random() < SLIP[level]) return pick(free)
  if (level === 'easy') {
    // after a hit, the squares around it; otherwise anywhere
    const near = [...open].flatMap(neighbours).filter((c) => free.includes(c))
    return pick(near.length ? near : free)
  }
  if (level === 'medium' && !open.size) {
    // hunt on a checkerboard: every ship is at least two long, so it can't hide between the squares
    const smallest = Math.min(...read(w).afloat)
    const parity = free.filter((c) => (row(c) + col(c)) % smallest === 0)
    return pick(parity.length ? parity : free)
  }
  const best = densest(w)
  return pick(best.length ? best : free)
}

export const battleshipBrain: Brain = (state, level) => {
  const raw = (state as unknown as BattleshipState).live
  if (!raw) return null
  const live = norm(raw)
  const target = live.waters[1 - BOT_SEAT]
  if (live.phase !== 'firing' || live.turn !== BOT_SEAT || target.pending !== undefined) return null
  const cell = aim(target, level)
  if (cell === undefined) return null
  return (cur: Live) => fire(cur, BOT_SEAT, cell)
}

/** squares a whole fleet covers */
const FLEET_CELLS = FLEET.reduce((n, s) => n + s.len, 0)
const sunkOn = (live: Live, s: 0 | 1) => (norm(live).waters[s].sunk ?? []).length

/** How the game looks to Ops, for her reactions: who has hit more of the other's fleet, and ships going down. */
export const battleshipSense: OpsSense = {
  turn: (state) => {
    const raw = (state as unknown as BattleshipState).live
    return !raw || raw.phase !== 'firing' ? null : raw.turn
  },
  standing: (state) => {
    const raw = (state as unknown as BattleshipState).live
    if (!raw || raw.phase !== 'firing') return null
    const live = norm(raw)
    const hit = (s: 0 | 1) => (live.waters[s].hits ?? []).length / FLEET_CELLS
    // her hits on your waters against yours on hers
    return squash(3 * (hit(0) - hit(BOT_SEAT)), 1)
  },
  ended: (state) => {
    const raw = (state as unknown as BattleshipState).live
    if (!raw || raw.phase !== 'done' || raw.winner === undefined) return null
    return { winner: raw.winner, final: matchOver(norm(raw)) }
  },
  moment: (prev, next) => {
    const a = (prev as unknown as BattleshipState).live
    const b = (next as unknown as BattleshipState).live
    if (!a || !b || b.game !== a.game) return null
    if (sunkOn(b, 0) > sunkOn(a, 0)) return 'took'
    if (sunkOn(b, BOT_SEAT) > sunkOn(a, BOT_SEAT)) return 'lost'
    return null
  },
}
