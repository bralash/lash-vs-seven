import type { Level } from '../../match/bot'

/*
 * Table tennis, seen from above. The table runs from your end (y = 0) to Ops' end (y = 1), net at
 * 0.5; x runs from -1 (left edge) to 1 (right edge). Every shot is a flight planned the moment it's
 * hit: from the racket to a bounce on the far half, then on to the other racket's line. Nothing is
 * simulated frame by frame, so the same shot plays out the same on any phone (that's what will let
 * it go online later: a shot is one message).
 *
 * The match state only changes at the end of a point: the rally itself lives on the screen.
 */

export type Side = 0 | 1
export const NET_Y = 0.5
/** where each racket meets the ball, just past each end of the table */
export const HIT_Y: Record<Side, number> = { 0: -0.04, 1: 1.04 }
/** points to win a game (win by 2) */
export const POINTS = 11
/** a finished game stays on screen this long before the next one */
export const RESULT_MS = 2200

export interface Live {
  points: [number, number]
  games: [number, number]
  /** the game in play, from 1 */
  game: number
  /** who served the first point of this game */
  starter: Side
  /** the point just played, for the banner */
  last?: { winner: Side; why: Why; n: number } | null
  /** set when a game ends: who took it, and whether that settles the match */
  result?: { winner: Side; final: boolean } | null
  /** the final score of each finished game */
  history?: [number, number][]
}

export type Why = 'miss' | 'net' | 'long' | 'wide' | 'winner'

export function freshLive(starter: Side, game = 1, games: [number, number] = [0, 0], history: [number, number][] = []): Live {
  return { points: [0, 0], games, game, starter, last: null, result: null, history }
}

/** Who serves now: two serves each, then one each from 10–10. */
export function serverOf(l: Live): Side {
  const [a, b] = l.points
  const total = a + b
  const deuce = 2 * (POINTS - 1) // 10–10
  const turns = a >= POINTS - 1 && b >= POINTS - 1 ? deuce / 2 + (total - deuce) : Math.floor(total / 2)
  return ((l.starter + turns) % 2) as Side
}

/** The point goes to `winner`; ends the game (and maybe the match, at `target` games) when it's won. */
export function awardPoint(l: Live, winner: Side, why: Why, target: number): Live {
  if (l.result) return l
  const points: [number, number] = [...l.points]
  points[winner]++
  const [a, b] = points
  const won = (a >= POINTS || b >= POINTS) && Math.abs(a - b) >= 2
  const n = (l.last?.n ?? 0) + 1
  if (!won) return { ...l, points, last: { winner, why, n } }
  const games: [number, number] = [...l.games]
  games[winner]++
  return { ...l, points, games, last: { winner, why, n }, result: { winner, final: games[winner] >= target }, history: [...(l.history ?? []), points] }
}

/** The next game, after `finished`: the other player starts serving. */
export function nextGame(l: Live, finished: number): Live | undefined {
  if (!l.result || l.result.final || l.game !== finished) return undefined
  return freshLive((1 - l.starter) as Side, l.game + 1, l.games, l.history)
}

/* ── shots ── */

export interface Flight {
  by: Side
  from: { x: number; y: number }
  bounce: { x: number; y: number }
  to: { x: number; y: number }
  /** clock times (ms): hit, bounce, reaching the other racket's line */
  t0: number
  tb: number
  t1: number
  /** sidespin (-1…1, in the table's x): curls it in the air */
  curl: number
  /** topspin (+) or backspin (−), -1…1: topspin dips it and kicks it on off the bounce, backspin floats it and checks up */
  top: number
  /** how high it climbs before the bounce, and how high it hops after */
  arc: number
  hop: number
  /** what went wrong with it, if anything: it never reaches the other racket */
  fault?: 'net' | 'long' | 'wide'
  /** a smash: flat, fast, hardly a hop */
  smash?: boolean
}

export interface Shot {
  /** where along the far half it lands, -1…1 across */
  aim: number
  /** 0 a soft push, 1 a smash */
  power: number
  /** sidespin, -1…1: curls in the air and kicks off the bounce */
  curl: number
  /** topspin (+) / backspin (−), -1…1 */
  top: number
  /** how far off the timing was, 0 (sweet) … 1 (scraped it) */
  err: number
  /** Ops clipping a ball she couldn't really reach: it goes out this way */
  force?: 'net' | 'long' | 'wide'
  /** a high ball put away: flat and fast, and a sitter is easy to place, so it strays less */
  smash?: boolean
  /** a weak return that pops up high: there for the taking */
  lob?: boolean
}

/** a smash still takes this long end to end, so there's always time to see it (and, online, for the message) */
export const MIN_FLIGHT_MS = 620
const MAX_FLIGHT_MS = 1350
/** how high a racket meets the ball */
const HIT_Z = 0.25

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Plans the flight of a shot hit by `by` from (`fromX`, `fromY`) at clock time `t0`. `rand` is 0…1. */
export function plan(by: Side, fromX: number, s: Shot, t0: number, rand: () => number = Math.random, fromY = HIT_Y[by]): Flight {
  const dir = by === 0 ? 1 : -1
  const far = (d: number) => (by === 0 ? d : 1 - d) // a depth on the far half, measured from the hitter
  // a mistimed shot drifts: sideways one way or the other, and long or short
  const wobble = Math.pow(s.err, 1.4)
  // hard shots punish bad timing more
  const risk = wobble * (0.75 + s.power * 0.6) * (s.smash ? 0.5 : 1)
  let bx = s.aim * 0.9 + (rand() - 0.5) * 1.9 * risk + s.curl * 0.12
  // topspin brings it down sooner, backspin carries a little further
  let depth = lerp(0.62, 0.93, s.power) + (rand() - 0.3) * 0.5 * risk - s.top * 0.04
  // a soft scoop off a bad touch dies in the net
  if (s.power < 0.06 && s.err > 0.6) depth = 0.46
  if (s.force === 'wide') bx = (s.aim >= 0 ? 1 : -1) * (1.08 + rand() * 0.25)
  if (s.force === 'long') depth = 1.04 + rand() * 0.08
  if (s.force === 'net') depth = 0.46
  const bounce = { x: bx, y: far(depth) }
  // sidespin kicks it on sideways off the bounce
  const to = { x: clamp(bx + (bx - fromX) * 0.3 + s.curl * 0.3, -1.6, 1.6), y: HIT_Y[(1 - by) as Side] }
  // met early, nearer the net, it has less far to go and gets there sooner (late, further)
  const reach = clamp(Math.abs(to.y - fromY) / Math.abs(to.y - HIT_Y[by]), 0.7, 1.2)
  const total = Math.max(MIN_FLIGHT_MS, lerp(MAX_FLIGHT_MS, MIN_FLIGHT_MS, s.power) * reach)
  const k = clamp(Math.abs(bounce.y - fromY) / Math.abs(to.y - fromY), 0.5, 0.85)
  const pre = total * k
  // topspin kicks on off the bounce (quicker to you), backspin checks up (slower)
  const post = Math.max(total * (1 - k) * (1 - 0.3 * s.top), MIN_FLIGHT_MS - pre)
  const fault = depth < NET_Y + 0.02 ? 'net' : depth > 1 ? 'long' : Math.abs(bx) > 1 ? 'wide' : undefined
  // soft shots loop high, drives stay flat; topspin dips, backspin floats
  const arc = s.smash ? 0.22 : lerp(0.95, 0.42, s.power) * (1 - 0.25 * s.top) * (s.lob ? 1.25 : 1)
  return {
    by,
    from: { x: fromX, y: fromY },
    bounce,
    to,
    t0,
    tb: t0 + pre,
    t1: t0 + pre + post,
    curl: s.curl * dir,
    top: s.top,
    arc,
    // backspin pops up off the table, topspin skids low
    hop: s.smash ? 0.14 : arc * 0.55 * (1 - 0.45 * s.top) * (s.lob ? 1.7 : 1),
    fault,
    smash: s.smash,
  }
}

/**
 * Where the ball is at clock time `t`: x, y on the table and z, its height (0 = on the table).
 * Like a real ball, it crosses the table at an even pace while its height follows a parabola: it
 * slows as it climbs, hangs at the top, then drops faster into the bounce and pops up off it.
 */
export function ballAt(f: Flight, t: number): { x: number; y: number; z: number } {
  if (f.fault === 'net' && t >= f.tb) {
    // it hits the tape and drops
    const v = Math.min(1, (t - f.tb) / 300)
    return { x: f.bounce.x, y: NET_Y + (f.by === 0 ? -0.02 : 0.02), z: 0.25 * (1 - v) * (1 - v) }
  }
  if (t <= f.tb) {
    const u = clamp((t - f.t0) / (f.tb - f.t0), 0, 1)
    // topspin pulls it down late in the flight
    const lift = f.arc * 4 * u * (1 - u) * (1 - f.top * 0.35 * u)
    return {
      x: lerp(f.from.x, f.bounce.x, u) + f.curl * 0.16 * Math.sin(Math.PI * u),
      y: lerp(f.from.y, f.bounce.y, u),
      z: HIT_Z * (1 - u) + lift,
    }
  }
  // after the bounce it carries on past the racket's line if nobody hits it
  const v = (t - f.tb) / (f.t1 - f.tb)
  // the hop peaks a little after the racket's line and falls away past it
  const w = Math.min(v / 1.35, 1)
  return {
    x: lerp(f.bounce.x, f.to.x, v),
    y: lerp(f.bounce.y, f.to.y, v),
    z: f.hop * 4 * w * (1 - w) + HIT_Z * 0.35 * Math.min(v, 1),
  }
}

/* ── your swipe ── */

export interface Swipe {
  /** pointer path in screen px, with times (ms) */
  points: { x: number; y: number; t: number }[]
}

/** How far a path bows away from its straight line, as a share of its length (signed): a curved stroke puts spin on it. */
function bowOf(p: Swipe['points'], dx: number, dy: number) {
  const a = p[0]
  const len = Math.hypot(dx, dy)
  if (!len) return 0
  let bow = 0
  for (const q of p) {
    const d = ((q.x - a.x) * -dy - (q.y - a.y) * dx) / len // signed distance from the chord (up is -y on screen)
    if (Math.abs(d) > Math.abs(bow)) bow = d
  }
  return bow / len
}

/** How a serve's flick reads as a shot, or null if it wasn't a swing (too short, or not upwards). */
export function readSwipe(sw: Swipe, err: number): Shot | null {
  const p = sw.points
  if (p.length < 2) return null
  const a = p[0]
  const b = p[p.length - 1]
  const dx = b.x - a.x
  const dy = a.y - b.y // up is positive
  const ms = Math.max(16, b.t - a.t)
  if (dy < 28) return null
  const speed = Math.hypot(dx, dy) / ms // px per ms
  return {
    aim: clamp((dx / dy) * 1.3, -1, 1),
    power: clamp((speed - 0.35) / 2.2, 0, 1),
    curl: clamp(-bowOf(p, dx, dy) * 4, -1, 1),
    // a fast stroke rolls over the ball (topspin), a slow push chops under it (backspin)
    top: clamp((speed - 1.1) / 1.4, -0.7, 1),
    err,
  }
}

/**
 * The bat meets the ball: `p` is the thumb's path over the last moment. Pushing up hits it (a fast
 * push is a drive, a slow one a block, the angle aims, a curve spins it); a still bat just blocks it
 * back off its face, wherever on the bat it struck (`off`, table x units from the middle).
 */
export function readStroke(p: Swipe['points'], err: number, off: number): Shot {
  const a = p[0]
  const b = p[p.length - 1]
  const dx = a && b ? b.x - a.x : 0
  const dy = a && b ? a.y - b.y : 0
  // how hard: the thumb's speed up the screen right at the end (the ball usually meets the bat early in the push)
  const from = p.find((q) => b.t - q.t <= 60) ?? a
  const prev = p[p.length - 2]
  // (or its very last movement, when the bat meets the ball on the first stretch of a push)
  const up = from && b ? Math.max((from.y - b.y) / Math.max(16, b.t - from.t), prev ? (prev.y - b.y) / Math.max(10, b.t - prev.t) : 0) : 0
  if (dy < 8 || up < 0.12) return { aim: clamp(off * 1.6, -0.9, 0.9), power: 0.04, curl: 0, top: -0.15, err: Math.max(err, 0.2) }
  return {
    aim: clamp((dx / dy) * 1.3 + off * 0.5, -1, 1),
    power: clamp((up - 0.2) / 1.6, 0, 1),
    curl: clamp(-bowOf(p, dx, dy) * 4, -1, 1),
    top: clamp((up - 0.9) / 1.2, -0.6, 1),
    err,
  }
}

/**
 * Meeting the ball `v` of the way from its bounce to your end line (0 just off the table, 1 at your
 * end, more past it). Early, rising off the bounce, it goes back sharper but it's easy to misjudge;
 * late, dropping away behind the table, there's time but it comes back softer.
 */
export function contact(v: number) {
  const early = clamp(1 - v / 0.35, 0, 1)
  const late = clamp((v - 1) / 0.8, 0, 1)
  return { err: early * early * 0.45 + Math.pow(late, 1.5) * 0.6, power: (p: number) => clamp(p * (1 - 0.5 * late) + 0.2 * early, 0, 1) }
}

/** how far from the middle of your bat the ball can be and still be hit (table x units) */
export const BAT_REACH = 0.42
/** Off the middle of the bat the shot goes astray: 0 dead centre … 1 the very edge. */
export function batErr(dx: number) {
  return clamp((Math.abs(dx) - 0.1) / (BAT_REACH - 0.1), 0, 1)
}
/** a ball this high off the bounce can be smashed (a normal ball hops to about 0.45; a pop-up to about 1) */
export const SMASH_Z = 0.6
/** and the push has to be at least this hard (0…1) */
export const SMASH_PUSH = 0.45

/** where your bat can go: across, and from well back off your end (min) up to near the net (max) */
export const BAT_X = 1.4
export const BAT_Y = { min: -0.24, max: 0.42 }
/** serving, you stand behind your end line */
export const SERVE_Y = -0.03
/** past here the ball's gone by you */
export const GONE_Y = BAT_Y.min - 0.12

/* ── Ops ── */

/** keep: how often she gets it back; pop: how often a hard ball makes her pop it up; smash: how often she punishes a high one */
const SKILL: Record<Level, { keep: number; aim: number; power: [number, number]; curl: number; err: number; pop: number; smash: number }> = {
  easy: { keep: 0.82, aim: 0.45, power: [0.1, 0.45], curl: 0.1, err: 0.5, pop: 1.3, smash: 0.25 },
  medium: { keep: 0.9, aim: 0.7, power: [0.25, 0.7], curl: 0.35, err: 0.38, pop: 1, smash: 0.45 },
  hard: { keep: 0.97, aim: 0.85, power: [0.35, 0.9], curl: 0.6, err: 0.26, pop: 0.6, smash: 0.7 },
}

/**
 * Ops meets the ball. How likely she is to get it back depends on her level and how hard the shot
 * was (fast, spinning, near an edge). Returns her shot; when she can't really get to it, either a
 * shot that clips it out (wide, long or into the net), or 'late': she lunges and it's past her.
 */
export function opsReturn(level: Level, incoming: Flight, rand: () => number = Math.random): Shot | 'late' {
  const k = SKILL[level]
  const pace = (MAX_FLIGHT_MS - (incoming.t1 - incoming.t0)) / (MAX_FLIGHT_MS - MIN_FLIGHT_MS)
  const edge = Math.max(0, Math.abs(incoming.bounce.x) - 0.6)
  const keep = k.keep - pace * 0.2 - Math.abs(incoming.curl) * 0.08 - Math.abs(incoming.top) * 0.06 - edge * 0.25 - (incoming.smash ? 0.45 : 0)
  const shot: Shot = {
    aim: (rand() * 2 - 1) * k.aim,
    power: lerp(k.power[0], k.power[1], rand()),
    curl: (rand() * 2 - 1) * k.curl,
    top: (rand() * 2 - 1) * k.curl,
    // now and then she mistimes one herself (it may still go in)
    err: rand() * k.err,
  }
  if (rand() <= keep) {
    // a ball sitting up high: she puts it away
    if (!incoming.smash && incoming.hop >= 0.55 && rand() < k.smash) return { ...shot, aim: (rand() < 0.5 ? -1 : 1) * lerp(0.6, 0.95, rand()), power: 1, top: 0.6, curl: 0, err: rand() * 0.15, smash: true }
    // under pressure (pace, spin) she gets it back, but pops it up
    if (rand() < (0.08 + pace * 0.25 + Math.abs(incoming.top) * 0.1) * k.pop) return { ...shot, aim: shot.aim * 0.6, power: 0.1, top: -0.3, lob: true }
    return shot
  }
  // she couldn't get there: a fast or wide ball gets past her, anything else she clips out
  if (rand() < 0.3 + pace * 0.4 + edge) return 'late'
  const r = rand()
  return { ...shot, force: r < 0.45 ? 'wide' : r < 0.8 ? 'long' : 'net' }
}

/** Ops' serve: steady, a little sharper on Hard. */
export function opsServe(level: Level, rand: () => number = Math.random): Shot {
  const k = SKILL[level]
  return { aim: (rand() * 2 - 1) * k.aim * 0.8, power: lerp(0.15, k.power[1] * 0.7, rand()), curl: (rand() * 2 - 1) * k.curl * 0.6, top: (rand() * 2 - 1) * k.curl * 0.6, err: rand() * 0.08 }
}
