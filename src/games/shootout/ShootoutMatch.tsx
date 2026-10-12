import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useServerOffset } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { MatchEnded } from '../../match/MatchEnded'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import type { CardInput } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { useRivalry } from '../../match/useRivalry'
import {
  AIM_MS,
  FLIGHT_MS,
  KICKS,
  RUN_MS,
  colOf,
  freshLive,
  isHigh,
  key,
  landing,
  newSalt,
  opsDive,
  opsShot,
  opsWait,
  revealIn,
  scored,
  shoot,
  shooterOf,
  spotAt,
  sway,
  tally,
  type Kick,
  type Outcome,
  type Reveal,
  type Seat,
  type ShootoutLive,
  type Spot,
} from './engine'
import '../../styles/shootout.css'

const GAME = 'shootout'

export interface ShootoutState {
  match: number
  live: ShootoutLive
  ready?: Record<string, boolean>
}

export function initialShootoutState(match = 1): ShootoutState {
  // seat 0 shoots first in odd matches, seat 1 in even ones
  return { match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

/* ── the scene: metres on the pitch (x across the goal, as the keeper's camera sees it; y up; z out
   from the goal line) projected onto a 100 × H picture ── */

const H = 150
const GOAL_W = 3.66
const GOAL_H = 2.44
const SPOT_Z = 11
const BALL_R = 0.11
type Cam = 'keeper' | 'shooter'
/** behind the keeper and above the bar, looking out; behind the ball, looking in (it moves up with the run-up) */
const KEEP_CAM = { z: -4.5, y: 4, f: 58, hy: 60 }
const SHOOT_CAM = { z: 15.2, y: 1.6, f: 166, hy: 45 }

function project(cam: Cam, x: number, y: number, z: number, dolly = 0): [number, number, number] {
  if (cam === 'keeper') {
    const k = KEEP_CAM.f / Math.max(0.6, z - KEEP_CAM.z)
    return [50 + x * k, KEEP_CAM.hy + (KEEP_CAM.y - y) * k, k]
  }
  const k = SHOOT_CAM.f / Math.max(0.6, SHOOT_CAM.z - dolly - z)
  return [50 - x * k, SHOOT_CAM.hy + (SHOOT_CAM.y - y) * k, k]
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = (u: number) => 1 - (1 - u) ** 2
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/** where the shot is going: the aim in metres (a low ball still sits on the grass) */
const targetOf = (k: { x: number; y: number }) => ({ x: k.x * GOAL_W, y: Math.max(BALL_R, k.y * GOAL_H) })

/** the ball of a kick at time t: the flight to the goal line, then where it ends up */
function ballOf(k: Kick, t: number): { x: number; y: number; z: number } {
  const T = targetOf(k)
  const u = (t - k.strike) / FLIGHT_MS
  if (u <= 0) return { x: 0, y: BALL_R, z: SPOT_Z }
  if (u <= 1) return { x: lerp(0, T.x, u), y: lerp(BALL_R, T.y, u) + 0.35 * Math.sin(Math.PI * u) * (T.y > 1 ? 0.6 : 1), z: lerp(SPOT_Z, 0, u) }
  const v = ease(clamp((t - k.strike - FLIGHT_MS) / 450))
  const side = Math.sign(T.x) || 1
  let E: { x: number; y: number; z: number }
  switch (k.outcome) {
    case 'goal':
    case 'tipsIn':
      E = { x: T.x * 1.04, y: Math.max(BALL_R, T.y * 0.75), z: -1.6 }
      break
    case 'saved':
      E = { x: T.x + side * 1.3, y: BALL_R, z: 2.8 }
      break
    case 'tips':
      E = { x: side * 4.7, y: T.y + 0.4, z: -1.4 }
      break
    case 'post':
    case 'bar':
      E = { x: T.x * 0.7, y: BALL_R, z: 4.2 }
      break
    default:
      E = { x: T.x * 1.25, y: T.y * 1.12, z: -2.2 }
  }
  return { x: lerp(T.x, E.x, v), y: lerp(T.y, E.y, v), z: lerp(0, E.z, v) }
}

/* ── stick figures (the art comes later) ── */

type Arms = 'ready' | 'up' | 'down' | 'run' | 'head' | 'cheer'
type Legs = 'stand' | 'run' | 'kick' | 'crouch'

/** a figure in its own metres (hips at 0, up the body is −y on screen), turned about the hips */
function Stick({ arms, legs, phase = 0, kit, gloves, back }: { arms: Arms; legs: Legs; phase?: number; kit: string; gloves?: boolean; back?: boolean }) {
  const swing = Math.sin(phase) * 0.28
  const hand: [number, number][] =
    arms === 'up'
      ? [[-0.22, -1.12], [0.22, -1.12]]
      : arms === 'ready'
        ? [[-0.48, -0.32], [0.48, -0.32]]
        : arms === 'down'
          ? [[-0.3, 0.12], [0.3, 0.12]]
          : arms === 'head'
            ? [[-0.14, -0.86], [0.14, -0.86]]
            : arms === 'cheer'
              ? [[-0.45, -1.05], [0.45, -1.05]]
              : [[-0.28, -0.18 + swing], [0.28, -0.18 - swing]]
  const foot: [number, number][] =
    legs === 'run'
      ? [[-0.12 + swing * 0.5, 0.92 - Math.max(0, swing) * 0.6], [0.12 - swing * 0.5, 0.92 - Math.max(0, -swing) * 0.6]]
      : legs === 'kick'
        ? [[-0.2, 0.92], [0.18, 0.45]]
        : legs === 'crouch'
          ? [[-0.34, 0.8], [0.34, 0.8]]
          : [[-0.2, 0.93], [0.2, 0.93]]
  return (
    <g className="so-stick">
      {foot.map(([x, y], i) => (
        <line key={`l${i}`} className="so-stick__limb" x1={i ? 0.09 : -0.09} y1={0} x2={x} y2={y} />
      ))}
      <rect className="so-stick__shorts" x={-0.17} y={-0.05} width={0.34} height={0.2} />
      {hand.map(([x, y], i) => (
        <line key={`a${i}`} className="so-stick__limb" x1={i ? 0.17 : -0.17} y1={-0.47} x2={x} y2={y} />
      ))}
      <line className="so-stick__body" x1={0} y1={-0.04} x2={0} y2={-0.5} style={{ stroke: kit }} />
      <circle className={back ? 'so-stick__head so-stick__head--back' : 'so-stick__head'} cx={0} cy={-0.74} r={0.15} />
      {gloves && hand.map(([x, y], i) => <circle key={`g${i}`} className="so-stick__glove" cx={x} cy={y} r={0.1} />)}
    </g>
  )
}

/** put a figure on the pitch: feet at (x, 0, z), hips lifted/shifted by (hx, hy) in metres, turned rot° about the hips */
function Placed({ cam, x, z, hx = 0, hy = 0.95, rot = 0, boost = 1, dolly = 0, children }: { cam: Cam; x: number; z: number; hx?: number; hy?: number; rot?: number; boost?: number; dolly?: number; children: ReactNode }) {
  const [sx, sy, k] = project(cam, x, 0, z, dolly)
  const flip = cam === 'shooter' ? -1 : 1
  return <g transform={`translate(${sx} ${sy}) scale(${k * boost * flip} ${k * boost}) translate(${hx} ${-hy}) rotate(${rot})`}>{children}</g>
}

/** the keeper reaching for a glove point g (metres, from his feet): standing if it's close, diving if it isn't */
function keeperBody(g: { x: number; y: number }): { hx: number; hy: number; rot: number; stretched: boolean } {
  const dx = g.x
  const dy = g.y - 0.95
  const dist = Math.hypot(dx, dy)
  const reach = 1.15
  // close by: crouched, leaning a little toward it
  if (dist <= reach) return { hx: dx * 0.25, hy: 0.87, rot: dx * 18, stretched: false }
  const hx = dx - (dx / dist) * reach
  const hy = 0.95 + dy - (dy / dist) * reach
  return { hx, hy, rot: (Math.atan2(dx, dy) * 180) / Math.PI, stretched: true }
}

/** the middle of a spot, where the keeper's gloves go */
const spotGlove = (s: Spot) => ({ x: colOf(s) * 2.5, y: colOf(s) === 0 ? (isHigh(s) ? 2.35 : 0.6) : isHigh(s) ? 2.0 : 0.35 })

const SAID: Record<Outcome, string> = {
  goal: 'Goal!',
  tipsIn: 'Goal! · off the fingertips',
  saved: 'Saved!',
  tips: 'Fingertip save!',
  post: 'Off the post',
  bar: 'Off the bar',
  wide: 'Wide',
  over: 'Over the bar',
}

const kitOf = (s: Seat) => (s === 0 ? 'var(--lash)' : 'var(--seven)')

export function ShootoutMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as ShootoutState
  const live = st.live
  const session = useSession(GAME, room.code)
  const vsOps = !!session.bot
  const online = !session.local && !vsOps
  const level = session.level ?? 'medium'
  const { play: sound } = useSound()
  const seats = playersBySeat(room)
  const mine = me.seat as Seat
  const theirs = (1 - mine) as Seat
  const opp = seats[theirs]
  const oppName = opp?.name ?? 'Ops'

  const over = !!live.result
  const showResults = useHold(over, 2600)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, online ? opp : null, inMatch)
  const offset = useServerOffset()
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const now = useCallback(() => Date.now() + offsetRef.current, [])

  const liveRef = useRef(live)
  liveRef.current = live
  const shooter = shooterOf(live.n, live.first)
  const iShoot = shooter === mine

  /** your dive for this kick (you can change it until the strike) */
  const dive = useRef<{ n: number; spot: Spot; salt: string } | null>(null)
  const [dived, setDived] = useState<{ n: number; spot: Spot } | null>(null)
  /** your shot once you've let go; Ops' shot once she has */
  const shot = useRef<{ n: number; x: number; y: number; salt: string } | null>(null)
  const opsShotRef = useRef<{ n: number; x: number; y: number; salt: string } | null>(null)
  /** the aim while your finger is down: where it started, and the aim before the sway */
  const aim = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [aiming, setAiming] = useState(false)
  /** what you've done so far (Ops reads it) */
  const yourShots = useRef<Spot[]>([])
  const yourDives = useRef<Spot[]>([])
  const worldEl = useRef<HTMLDivElement>(null)

  // the clock the scene is drawn at
  const [t, setT] = useState(() => now())
  useEffect(() => {
    if (showResults) return
    let raf = 0
    const frame = () => {
      setT(now())
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [showResults, now])

  // the first whistle: the host (or this phone, against Ops) sets it going
  useEffect(() => {
    if (live.start || over || !(me.isHost || vsOps || session.local)) return
    session.move<ShootoutLive>((cur) => (cur.start || cur.result ? undefined : { ...cur, start: now() + 1500 })).catch(() => {})
  }, [live.start, over, me.isHost, vsOps, session, now])

  /** you let go: the aim (with its sway) is the shot, and the run-up starts */
  const release = useCallback(
    (x: number, y: number) => {
      const l = liveRef.current
      if (l.result || !l.start || l.strike || shooterOf(l.n, l.first) !== mine) return
      const n = l.n
      shot.current = { n, x, y, salt: newSalt() }
      sound('tap')
      session.move<ShootoutLive>((cur) => shoot(cur, n, now() + RUN_MS)).catch(() => {})
    },
    [mine, now, session, sound],
  )

  /** your dive (changeable until the strike) */
  const pickDive = useCallback(
    (spot: Spot) => {
      const l = liveRef.current
      const tt = now()
      if (l.result || !l.start || tt < l.start || shooterOf(l.n, l.first) === mine) return
      if (l.strike && tt >= l.strike) return
      dive.current = { n: l.n, spot, salt: newSalt() }
      setDived({ n: l.n, spot })
      sound('tap')
    },
    [mine, now, sound],
  )

  const canAim = () => {
    const l = liveRef.current
    const tt = now()
    return !l.result && !!l.start && tt >= l.start && !l.strike && shooterOf(l.n, l.first) === mine
  }

  /** a point on the screen in the scene's own units */
  const toWorld = (cx: number, cy: number) => {
    const r = worldEl.current?.getBoundingClientRect()
    if (!r) return { x: 50, y: H / 2 }
    return { x: ((cx - r.left) / r.width) * 100, y: ((cy - r.top) / r.height) * H }
  }
  const metresPerPx = () => 9.5 / Math.max(320, Math.min(window.innerWidth, 640))

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    if (canAim()) {
      aim.current = { px: e.clientX, py: e.clientY, x: 0, y: 0.3 }
      setAiming(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      return
    }
    // in goal: the spot you tapped (above the middle of the goal is high)
    const w = toWorld(e.clientX, e.clientY)
    const [, midY] = project('keeper', 0, GOAL_H / 2, 0)
    const [postX] = project('keeper', GOAL_W, 0, 0)
    const gx = (w.x - 50) / (postX - 50)
    pickDive(spotAt(gx < -1 / 3 ? -1 : gx > 1 / 3 ? 1 : 0, w.y < midY))
  }
  const onMove = (e: React.PointerEvent) => {
    const a = aim.current
    if (!a) return
    const m = metresPerPx()
    // you see the goal from the front: your right is the keeper's left
    a.x = clamp(-((e.clientX - a.px) * m) / GOAL_W, -1.35, 1.35)
    a.y = clamp(0.3 - ((e.clientY - a.py) * m) / GOAL_H, 0, 1.35)
  }
  const onUp = () => {
    const a = aim.current
    if (!a) return
    aim.current = null
    setAiming(false)
    if (!canAim()) return
    const s = sway(a.x, a.y, now())
    release(s.x, s.y)
  }

  // keys on a computer: in goal A/D/W/S (Q/E high corners); shooting, the arrows aim and space shoots
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const l = liveRef.current
      if (shooterOf(l.n, l.first) === mine) {
        if (!canAim()) return
        const a = aim.current ?? (aim.current = { px: 0, py: 0, x: 0, y: 0.3 })
        if (!aiming) setAiming(true)
        if (e.key === 'ArrowLeft') a.x = clamp(a.x + 0.12, -1.35, 1.35)
        else if (e.key === 'ArrowRight') a.x = clamp(a.x - 0.12, -1.35, 1.35)
        else if (e.key === 'ArrowUp') a.y = clamp(a.y + 0.1, 0, 1.35)
        else if (e.key === 'ArrowDown') a.y = clamp(a.y - 0.1, 0, 1.35)
        else if (e.key === ' ' || e.key === 'Enter') onUp()
        return
      }
      const map: Record<string, Spot> = { a: 0, ArrowLeft: 0, d: 2, ArrowRight: 2, s: 1, ArrowDown: 1, w: 4, ArrowUp: 4, q: 3, e: 5 }
      if (e.key in map) pickDive(map[e.key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // the shooter's clock: out of time, it's a scuff down the middle; Ops lets go when she's ready
  useEffect(() => {
    if (!live.start || live.strike || over) return
    const n = live.n
    const opsShoots = vsOps && shooter === theirs
    const wait = opsShoots ? live.start + opsWait() - now() : live.start + AIM_MS - now()
    const timer = setTimeout(() => {
      if (opsShoots) {
        opsShotRef.current = { n, ...opsShot(level, yourDives.current), salt: newSalt() }
      } else if (shooter === mine) {
        aim.current = null
        setAiming(false)
        shot.current = null
      } else return
      session.move<ShootoutLive>((cur) => shoot(cur, n, now() + RUN_MS)).catch(() => {})
    }, Math.max(0, wait))
    return () => clearTimeout(timer)
  }, [live.n, live.start, live.strike, over, vsOps, shooter, mine, theirs, level, session, now])

  // the strike: both picks go in (Ops picks her dive now, from your habits)
  useEffect(() => {
    if (!live.strike || over) return
    const n = live.n
    const timer = setTimeout(() => {
      const myShot = shot.current?.n === n ? shot.current : null
      const myDive = dive.current?.n === n ? dive.current : null
      const mineR: Reveal = shooter === mine ? (myShot ? { x: myShot.x, y: myShot.y, salt: myShot.salt } : {}) : myDive ? { spot: myDive.spot, salt: myDive.salt } : {}
      if (!vsOps) return
      const o = opsShotRef.current?.n === n ? opsShotRef.current : null
      const opsR: Reveal = shooter === theirs ? (o ? { x: o.x, y: o.y, salt: o.salt } : {}) : { spot: opsDive(level, yourShots.current), salt: newSalt() }
      session.move<ShootoutLive>((cur) => revealIn(cur, n, { [key(mine)]: mineR, [key(theirs)]: opsR })).catch(() => {})
    }, Math.max(0, live.strike - now()))
    return () => clearTimeout(timer)
  }, [live.n, live.strike, over, vsOps, shooter, mine, theirs, level, session, now])

  // a kick settled: remember what you did (for Ops)
  const seen = useRef(live.last?.n ?? -1)
  useEffect(() => {
    const k = live.last
    if (!k || k.n === seen.current) return
    seen.current = k.n
    if (k.shooter === mine) yourShots.current.push(landing(k.x, k.y).spot)
    else if (k.reveal?.[key(mine)]?.spot !== undefined) yourDives.current.push(k.dive)
  }, [live.last, mine])

  // sounds: the whistle, the strike, the ball arriving
  const heard = useRef({ whistle: -1, strike: 0, land: -1 })
  useEffect(() => {
    const h = heard.current
    const k = live.last
    if (live.start && t >= live.start && h.whistle !== live.n && !over) {
      h.whistle = live.n
      sound('tick')
    }
    if (live.strike && t >= live.strike && h.strike !== live.strike) {
      h.strike = live.strike
      sound('pot')
    }
    if (k && t >= k.strike + FLIGHT_MS && h.land !== k.n) {
      h.land = k.n
      sound(scored(k.outcome) ? 'boom' : k.outcome === 'saved' || k.outcome === 'tips' ? 'smash' : k.outcome === 'post' || k.outcome === 'bar' ? 'clink' : 'whoosh')
    }
  }, [t, live.start, live.strike, live.n, live.last, over, sound])

  /* ── screens ── */

  const { goals, taken, kicks } = tally(live.log ?? [], live.first)
  const strip = (s: Seat) => {
    const marks: string[] = kicks[s].map((o) => (scored(o) ? '●' : '✕'))
    while (marks.length < KICKS) marks.push('○')
    // in sudden death, the last five
    return marks.slice(-KICKS).join(' ')
  }
  const card = (s: Seat) => <ScoreCard p={seats[s]} you={s === mine} turn={!over && shooter === s} value={goals[s]} meta={strip(s)} />
  if (abandoned && !over) {
    return (
      <MatchEnded
        room={room}
        me={me}
        seats={seats}
        exit={exit}
        scoreboard={
          <>
            {card(0)}
            <span className="mt-ended__vs" aria-hidden="true">vs</span>
            {card(1)}
          </>
        }
      />
    )
  }
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  // what's on screen: the kick just taken (until the next whistle), else the one coming up
  const last = live.last && (!live.start || t < live.start || over) ? live.last : null
  const struck = !!live.strike && t >= live.strike
  const cam: Cam = last || struck || !iShoot ? 'keeper' : 'shooter'
  const keeperSeat = last ? ((1 - last.shooter) as Seat) : ((1 - shooter) as Seat)
  const shooterSeat = last ? last.shooter : shooter
  const round = Math.floor(live.n / 2) + 1
  const sudden = Math.min(taken[0], taken[1]) >= KICKS
  const myDive = !last && dived && dived.n === live.n ? dived.spot : null
  const picking = !last && !over && !iShoot && !!live.start && t >= live.start && !struck

  /* the keeper: gloves reaching for a point, from his ready crouch (leaning toward your pick, on your phone) */
  let glove = { x: 0, y: 1.15 }
  let arms: Arms = 'ready'
  if (last) {
    const T = targetOf(last)
    const reached = last.outcome === 'saved' ? T : last.outcome === 'tips' ? { x: T.x * 0.94, y: T.y - 0.12 } : spotGlove(last.dive)
    const u = ease(clamp((t - last.strike) / (FLIGHT_MS * 0.85)))
    glove = { x: lerp(0, reached.x, u), y: lerp(1.15, reached.y, u) }
    // down on the grass after a dive
    const fall = clamp((t - last.strike - FLIGHT_MS - 300) / 300)
    if (Math.abs(reached.x) > 1 && fall > 0) glove = { x: glove.x, y: lerp(glove.y, 0.35, ease(fall)) }
    arms = u > 0.15 ? 'up' : 'ready'
  } else if (myDive !== null && cam === 'keeper') {
    glove = { x: colOf(myDive) * 0.3, y: isHigh(myDive) ? 1.45 : 1.0 }
    arms = isHigh(myDive) ? 'up' : 'ready'
  }
  const body = keeperBody(glove)
  if (!body.stretched && last && glove.y > 1.6) arms = 'up'
  const jump = last && colOf(last.dive) === 0 && isHigh(last.dive) && !['saved', 'tips'].includes(last.outcome) ? Math.sin(Math.PI * clamp((t - last.strike) / 700)) * 0.4 : 0

  /* the shooter: waiting by the ball, the run-up, the strike, then how it went */
  const runFrom = { x: -1.1, z: 13.6 }
  const runTo = { x: -0.32, z: 11.35 }
  let sx = runFrom.x
  let sz = runFrom.z
  let sArms: Arms = 'down'
  let sLegs: Legs = 'stand'
  let phase = 0
  if (last) {
    sx = runTo.x
    sz = runTo.z
    const after = t - last.strike - FLIGHT_MS
    sLegs = after < 200 ? 'kick' : 'stand'
    if (after > 150) sArms = scored(last.outcome) ? 'cheer' : 'head'
  } else if (live.strike) {
    const u = clamp((t - (live.strike - RUN_MS)) / RUN_MS)
    sx = lerp(runFrom.x, runTo.x, u)
    sz = lerp(runFrom.z, runTo.z, u)
    if (u >= 1) sLegs = 'kick'
    else if (u > 0) {
      sLegs = 'run'
      sArms = 'run'
      phase = u * Math.PI * 5
    }
  }

  const ball = last ? ballOf(last, t) : { x: 0, y: BALL_R, z: SPOT_Z }
  const dolly = cam === 'shooter' && live.strike ? 2.2 * ease(clamp((t - (live.strike - RUN_MS)) / RUN_MS)) : 0
  const aimNow = aiming && aim.current ? sway(aim.current.x, aim.current.y, t) : null
  const banner = last && t >= last.strike + FLIGHT_MS + 60 ? last : null
  const bannerMine = banner ? scored(banner.outcome) === (banner.shooter === mine) : false

  let status: string
  if (over) status = live.result?.winner === mine ? 'You win the shootout' : `${oppName} wins the shootout`
  else if (last) status = ''
  else if (iShoot) status = live.strike ? 'Run-up…' : t >= live.start && live.start ? 'You shoot · drag to aim, let go' : 'You’re up to shoot'
  else status = struck ? '' : t >= live.start && live.start ? 'In goal · tap where you’ll dive' : `${oppName} is up to shoot`

  return (
    <main className="so">
      <div className="mt-hud">
        {card(0)}
        <div className="so-round">
          <span className="label">{sudden ? 'Sudden' : 'Kick'}</span>
          <span className="so-round__n">{sudden ? 'death' : `${Math.min(round, KICKS)}/${KICKS}`}</span>
        </div>
        {card(1)}
      </div>
      <p className={`so-status${!last && !over && (iShoot || picking) ? ' so-status--you' : ''}${status ? '' : ' so-status--quiet'}`} role="status">
        {status || ' '}
      </p>

      <div className="so-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div ref={worldEl} className="so-world" style={{ aspectRatio: `100 / ${H}` }}>
          <svg className="so-scene" viewBox={`0 0 100 ${H}`} aria-label={cam === 'keeper' ? 'The goal, from behind the keeper' : 'The goal, from behind the ball'}>
            {cam === 'keeper' ? (
              <KeeperView
                ball={ball}
                keeper={
                  <Placed cam="keeper" x={0} z={0.6} hx={body.hx} hy={body.hy + jump} rot={body.rot}>
                    <Stick arms={arms} legs={body.stretched ? 'stand' : 'crouch'} kit={kitOf(keeperSeat)} gloves back />
                  </Placed>
                }
                shooter={
                  <Placed cam="keeper" x={sx} z={sz} boost={1.5}>
                    <Stick arms={sArms} legs={sLegs} phase={phase} kit={kitOf(shooterSeat)} />
                  </Placed>
                }
                zones={!last && !iShoot ? { picked: myDive, open: picking } : null}
              />
            ) : (
              <ShooterView
                dolly={dolly}
                aim={aimNow}
                keeper={
                  <Placed cam="shooter" x={0} z={0.6} hy={0.87} boost={1.15} dolly={dolly}>
                    <Stick arms="ready" legs="crouch" kit={kitOf(keeperSeat)} gloves />
                  </Placed>
                }
              />
            )}
          </svg>
        </div>

        {banner && (
          <div key={banner.n} className={`so-banner${bannerMine ? ' so-banner--mine' : ''}`} aria-hidden="true">
            {SAID[banner.outcome]}
          </div>
        )}
        {!last && !over && live.n < 2 && live.start > 0 && t >= live.start && !struck && (
          <p className="so-hint" aria-hidden="true">
            {iShoot
              ? 'Drag to aim, let go to shoot · the aim sways more near the posts and the bar'
              : 'Tap where you’ll dive (high or low, left, middle or right) · you can change it until the kick'}
          </p>
        )}
      </div>
      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── the two cameras ── */

function Pitch({ cam, dolly = 0 }: { cam: Cam; dolly?: number }) {
  const p = (x: number, y: number, z: number) => project(cam, x, y, z, dolly)
  const hy = cam === 'keeper' ? KEEP_CAM.hy : SHOOT_CAM.hy
  // mown stripes across the pitch, every 3 m
  const zs = cam === 'keeper' ? [0, 3, 6, 9, 12, 15, 18, 21, 24, 30, 40, 60] : [16, 13, 10, 7, 4, 1, -2, -6, -12, -30]
  const stripes = []
  for (let i = 0; i < zs.length - 1; i++) {
    const a = p(0, 0, zs[i])[1]
    const b = p(0, 0, zs[i + 1])[1]
    if (i % 2) stripes.push(<rect key={i} className="so-pitch__stripe" x={-50} y={Math.min(a, b)} width={200} height={Math.abs(a - b)} />)
  }
  const line = (x1: number, z1: number, x2: number, z2: number, k: string) => {
    const [a, b] = p(x1, 0, z1)
    const [c, d] = p(x2, 0, z2)
    return <line key={k} className="so-pitch__line" x1={a} y1={b} x2={c} y2={d} />
  }
  const [spX, spY, spK] = p(0, 0, SPOT_Z)
  return (
    <g>
      <rect className="so-crowd" x={-50} y={hy - 16} width={200} height={16} />
      <rect className="so-board" x={-50} y={hy - 4} width={200} height={4} />
      <rect className="so-pitch" x={-50} y={hy} width={200} height={H} />
      {stripes}
      {cam === 'keeper' ? (
        <>
          {line(-30, 0, 30, 0, 'goal')}
          {line(-9.16, 5.5, 9.16, 5.5, 'six')}
          {line(-9.16, 0, -9.16, 5.5, 'sixl')}
          {line(9.16, 0, 9.16, 5.5, 'sixr')}
          {line(-20.16, 16.5, 20.16, 16.5, 'box')}
        </>
      ) : (
        <>
          {line(-30, 0, 30, 0, 'goal')}
          {line(-9.16, 5.5, 9.16, 5.5, 'six')}
          {line(-9.16, 0, -9.16, 5.5, 'sixl')}
          {line(9.16, 0, 9.16, 5.5, 'sixr')}
        </>
      )}
      <ellipse className="so-pitch__spot" cx={spX} cy={spY} rx={0.18 * spK} ry={0.07 * spK} />
    </g>
  )
}

function Ball({ cam, at, dolly = 0, boost = 1 }: { cam: Cam; at: { x: number; y: number; z: number }; dolly?: number; boost?: number }) {
  const [x, y, k] = project(cam, at.x, at.y, at.z, dolly)
  const [gx, gy, gk] = project(cam, at.x, 0, at.z, dolly)
  const r = BALL_R * k * boost
  return (
    <g>
      <ellipse className="so-ball__shadow" cx={gx} cy={gy} rx={BALL_R * gk * boost * 1.1} ry={BALL_R * gk * boost * 0.4} />
      <circle className="so-ball" cx={x} cy={y} r={r} />
      <circle className="so-ball__patch" cx={x - r * 0.2} cy={y - r * 0.15} r={r * 0.35} />
    </g>
  )
}

/** the goal frame: posts, bar, and the stanchions running back to the net */
function Frame({ cam, dolly = 0 }: { cam: Cam; dolly?: number }) {
  const p = (x: number, y: number, z: number) => project(cam, x, y, z, dolly)
  const pts = (a: [number, number, number], b: [number, number, number]) => {
    const [x1, y1] = p(...a)
    const [x2, y2] = p(...b)
    return { x1, y1, x2, y2 }
  }
  const back = -1.8
  return (
    <g>
      <line className="so-frame__back" {...pts([-GOAL_W, GOAL_H, 0], [-GOAL_W, 0.4, back])} />
      <line className="so-frame__back" {...pts([GOAL_W, GOAL_H, 0], [GOAL_W, 0.4, back])} />
      <line className="so-frame__back" {...pts([-GOAL_W, 0, back], [GOAL_W, 0, back])} />
      <line className="so-frame" {...pts([-GOAL_W, 0, 0], [-GOAL_W, GOAL_H, 0])} />
      <line className="so-frame" {...pts([GOAL_W, 0, 0], [GOAL_W, GOAL_H, 0])} />
      <line className="so-frame" {...pts([-GOAL_W - 0.06, GOAL_H, 0], [GOAL_W + 0.06, GOAL_H, 0])} />
    </g>
  )
}

/** from behind the keeper: the pitch and the shooter, the keeper's back, the frame nearest of all */
function KeeperView({ ball, keeper, shooter, zones }: { ball: { x: number; y: number; z: number }; keeper: ReactNode; shooter: ReactNode; zones: { picked: Spot | null; open: boolean } | null }) {
  const ballEl = <Ball cam="keeper" at={ball} boost={2.2} />
  const zoneRect = (s: Spot) => {
    const c = colOf(s)
    const [x1, y1] = project('keeper', (c - 0.5) * (2 * GOAL_W) / 3, isHigh(s) ? GOAL_H : GOAL_H / 2, 0)
    const [x2, y2] = project('keeper', (c + 0.5) * (2 * GOAL_W) / 3, isHigh(s) ? GOAL_H / 2 : 0, 0)
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }
  return (
    <g>
      <Pitch cam="keeper" />
      {ball.z > 0.6 && ballEl}
      {shooter}
      {keeper}
      {ball.z <= 0.6 && ball.z > 0 && ballEl}
      {zones && (
        <g className={`so-zones${zones.open ? ' so-zones--open' : ''}`}>
          {([0, 1, 2, 3, 4, 5] as Spot[]).map((s) => (
            <rect key={s} className={`so-zone${zones.picked === s ? ' so-zone--on' : ''}`} {...zoneRect(s)} />
          ))}
        </g>
      )}
      <Frame cam="keeper" />
      {ball.z <= 0 && ballEl}
    </g>
  )
}

/** from behind the ball: the goal and their keeper ahead, your aim on the goal */
function ShooterView({ dolly, aim, keeper }: { dolly: number; aim: { x: number; y: number } | null; keeper: ReactNode }) {
  const p = (x: number, y: number, z: number) => project('shooter', x, y, z, dolly)
  const [nx1, ny1] = p(GOAL_W, GOAL_H, 0)
  const [nx2, ny2] = p(-GOAL_W, 0, 0)
  const dot = aim ? p(aim.x * GOAL_W, aim.y * GOAL_H, 0) : null
  const off = aim ? landing(aim.x, aim.y).miss : undefined
  return (
    <g>
      <defs>
        <pattern id="so-net" width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M0 0 L2 2 M2 0 L0 2" className="so-net__mesh" />
        </pattern>
      </defs>
      <Pitch cam="shooter" dolly={dolly} />
      <rect className="so-net" x={nx1} y={ny1} width={nx2 - nx1} height={ny2 - ny1} fill="url(#so-net)" />
      <Frame cam="shooter" dolly={dolly} />
      {keeper}
      {dot && (
        <g className={`so-aim${off ? ' so-aim--off' : ''}`}>
          <circle cx={dot[0]} cy={dot[1]} r={2.4} />
          <line x1={dot[0] - 3.6} y1={dot[1]} x2={dot[0] + 3.6} y2={dot[1]} />
          <line x1={dot[0]} y1={dot[1] - 3.6} x2={dot[0]} y2={dot[1] + 3.6} />
        </g>
      )}
      <Ball cam="shooter" at={{ x: 0, y: BALL_R, z: SPOT_Z }} dolly={dolly} />
    </g>
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: ShootoutState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const { goals, kicks, taken } = tally(st.live.log ?? [], st.live.first)
  const winner = (st.live.result?.winner ?? (goals[0] >= goals[1] ? 0 : 1)) as Seat
  const iWon = winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const sudden = Math.min(taken[0], taken[1]) > KICKS

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      sound('findBig')
    }
  }, [iWon, sound])

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialShootoutState(st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${goals[0]} — ${goals[1]}${sudden ? ' (sudden death)' : ''}`
  const marks = (s: Seat) => kicks[s].map((o) => (scored(o) ? '●' : '✕')).join(' ')
  const card: CardInput = {
    game: 'Shootout',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(goals[k]), meta: 'scored' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: [0, 1].map((k) => ({ word: names[k], seat: k as Seat, note: marks(k as Seat) })) },
  }

  return (
    <main className="so so-results screen-in">
      {iWon && <Confetti />}
      <div className="so-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match}
          {sudden ? ' · sudden death' : ''}
        </p>
        <h1 className={`so-results__title${iWon ? ' so-results__title--win' : ''}`}>{iWon ? 'You win' : `${seats[winner]?.name ?? 'Ops'} wins`}</h1>
        <p className="so-results__line">
          {goals[0]} <span>—</span> {goals[1]}
        </p>
        {st.live.result?.why === 'foul' && <p className="so-results__note">A kick didn’t match its lock-in</p>}
      </div>
      <div className="so-strip">
        {([0, 1] as Seat[]).map((s) => (
          <div key={s} className="so-strip__row">
            <span className="so-strip__name">{names[s]}</span>
            <span className="so-strip__kicks">
              {kicks[s].map((o, i) => (
                <span key={i} className={`so-kick so-kick--${scored(o) ? 'in' : 'out'}`} style={{ background: scored(o) ? kitOf(s) : undefined }} title={SAID[o]} />
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={goals[0]} meta="Scored" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={goals[1]} meta="Scored" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Shootout', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={!session.bot && (room.status === 'abandoned' || !opp?.online)}
        onReady={() => {
          sound('tap')
          session.ready(me.id)
        }}
        onLeave={exit.now}
      />
    </main>
  )
}
