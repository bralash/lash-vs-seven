import { squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import type { Seat } from '../../lobby/rooms'
import { BALL, BR, LENGTH, R, simulate, type Flick, type Pos } from './physics'
import type { Live } from './rules'

/*
 * Ops flicks from inside the match screen, once the last flick has stopped rolling (the shared
 * brain would fire while the discs are still sliding), so the turn-by-turn brain has nothing to do.
 */
export const footballBrain: Brain = () => null

/** how long she lines a flick up (ms): [least, most] */
export const OPS_THINK: Record<Level, [number, number]> = {
  easy: [900, 1700],
  medium: [900, 1600],
  hard: [800, 1400],
}

/** how far off she can be: aim (radians) and power */
const SLIP: Record<Level, { aim: number; power: number; top: number }> = {
  easy: { aim: 0.09, power: 0.18, top: 8 },
  medium: { aim: 0.035, power: 0.08, top: 3 },
  hard: { aim: 0.01, power: 0.03, top: 1 },
}

/** the goal `seat` attacks */
const target = (seat: Seat) => ({ x: 0.5, y: seat === 0 ? -0.05 : LENGTH + 0.05 })
/** how far up the pitch the ball is for `seat`, 0 (own line) to 1 (their line) */
const upfield = (pos: Pos, seat: Seat) => (seat === 0 ? 1 - pos[BALL * 2 + 1] / LENGTH : pos[BALL * 2 + 1] / LENGTH)
const discsOf = (seat: Seat) => (seat === 0 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9])

/** Flicks worth trying for `seat`: through the ball at the goal (and either side of it), straight at the ball, and a few anywhere. */
function candidates(pos: Pos, seat: Seat, wide: boolean): Flick[] {
  const out: Flick[] = []
  const bx = pos[BALL * 2]
  const by = pos[BALL * 2 + 1]
  const goal = target(seat)
  for (const d of discsOf(seat)) {
    const x = pos[d * 2]
    const y = pos[d * 2 + 1]
    for (const off of [-0.09, 0, 0.09]) {
      // where the disc has to meet the ball to send it at that spot
      const tx = goal.x + off - bx
      const ty = goal.y - by
      const tl = Math.hypot(tx, ty) || 1
      const gx = bx - (tx / tl) * (R + BR)
      const gy = by - (ty / tl) * (R + BR)
      const angle = Math.atan2(gy - y, gx - x)
      for (const power of [0.55, 0.8, 1]) out.push({ disc: d, angle, power })
    }
    const straight = Math.atan2(by - y, bx - x)
    for (const power of [0.4, 0.75]) out.push({ disc: d, angle: straight, power })
    if (wide) for (let k = 0; k < 4; k++) out.push({ disc: d, angle: Math.random() * Math.PI * 2, power: 0.35 + Math.random() * 0.5 })
  }
  return out
}

/** How good an end position is for `seat`: goals most of all, then the ball up the pitch and bodies behind it. */
function value(end: Pos, goal: 'top' | 'bottom' | null, seat: Seat) {
  if (goal) return (goal === 'top') === (seat === 0) ? 1000 : -1000
  const up = upfield(end, seat)
  const bx = end[BALL * 2]
  // the ball near their goal mouth is a chance, near yours a danger
  const centred = 1 - Math.min(1, Math.abs(bx - 0.5) / 0.5)
  let v = up * 10 + (up > 0.75 ? centred * 6 : 0) - (up < 0.25 ? centred * 8 : 0)
  // discs between the ball and her own goal
  for (const d of discsOf(seat)) {
    const dUp = seat === 0 ? 1 - end[d * 2 + 1] / LENGTH : end[d * 2 + 1] / LENGTH
    if (dUp < up) v += 0.8
  }
  return v
}

/** Her flick. Hard looks at your best reply to her top few; Medium picks among her best three; Easy is loose. */
export function opsFlick(pos: Pos, seat: Seat, level: Level): Flick {
  const slip = SLIP[level]
  const scored = candidates(pos, seat, level !== 'hard')
    .map((f) => {
      const out = simulate(pos, f)
      return { f, end: out.end, v: value(out.end, out.goal, seat) }
    })
    .sort((a, b) => b.v - a.v)
  let pick = scored[0]
  if (level === 'hard' && pick.v < 1000) {
    const foe = (seat === 0 ? 1 : 0) as Seat
    let best = -Infinity
    for (const c of scored.slice(0, 6)) {
      let threat = 0
      for (const r of candidates(c.end, foe, false).filter((_, k) => k % 3 === 2)) {
        const o = simulate(c.end, r)
        if (o.goal) {
          threat = 1
          break
        }
      }
      const v = c.v - threat * 40
      if (v > best) (best = v), (pick = c)
    }
  } else if (slip.top > 1) pick = scored[Math.floor(Math.random() * Math.min(slip.top, scored.length))]
  const f = pick.f
  return {
    disc: f.disc,
    angle: f.angle + (Math.random() * 2 - 1) * slip.aim,
    power: Math.max(0.2, Math.min(1, f.power + (Math.random() * 2 - 1) * slip.power)),
  }
}

const live = (s: Record<string, unknown>) => (s as { live?: Live }).live

/** How Ops reads a match: goals count most, then where the ball is. */
export const footballSense: OpsSense = {
  key: (s) => {
    const l = live(s)
    return l ? `${(s as { match?: number }).match}:${l.shot?.n ?? 0}` : ''
  },
  turn: (s) => {
    const l = live(s)
    return l && !l.result ? l.turn : null
  },
  standing: (s) => {
    const l = live(s)
    if (!l || l.result) return null
    return squash((l.scores.s1 - l.scores.s0) * 2 + (upfield(l.pos, 1) - 0.5), 2)
  },
  ended: (s) => {
    const l = live(s)
    return l?.result ? { winner: l.result.winner, final: true } : null
  },
  moment: (prev, next) => {
    const a = live(prev)
    const b = live(next)
    if (!a || !b) return null
    if (b.scores.s1 > a.scores.s1) return { moment: 'took', said: 'GOAL!' }
    if (b.scores.s0 > a.scores.s0) return { moment: 'lost', said: 'Ugh' }
    return null
  },
}
