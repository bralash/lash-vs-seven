import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useServerOffset } from '../../lib/serverTime'
import { load, save } from '../../lib/storage'
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
  CLAIM_MS,
  CLAIMED,
  NONE,
  REVEAL_WAIT_MS,
  closeCall,
  colOf,
  diveCommit,
  honest,
  lockIn,
  round as toKept,
  shotCommit,
  freshLive,
  isHigh,
  key,
  landing,
  newSalt,
  opsDive,
  opsShot,
  opsWait,
  replayMs,
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
import { HowTo } from './HowTo'
import { shootoutFeats } from './feats'
import keeperOrange from './sprites/keeper.png'
import keeperBlue from './sprites/keeper-blue.png'
import shooterOrange from './sprites/shooter.png'
import shooterBlue from './sprites/shooter-blue.png'
import '../../styles/shootout.css'

const GAME = 'shootout'
/** How to play shows before your first shootout against Ops on this device */
const HOWTO_KEY = 'lvs_shootout_howto'

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

/* ── the figures: noodle sprites cut from ChatGPT sheets (art/shootout-chatgpt, scripts/sprite-sheet.mjs);
   every dive and lean on them goes to the left, mirrored for the right ── */

const SHEET = {
  keeper: { img: [keeperOrange, keeperBlue], rows: 3, w: 256, h: 256, foot: [128, 242] },
  shooter: { img: [shooterOrange, shooterBlue], rows: 4, w: 256, h: 232, foot: [128, 220] },
} as const
/** sprite pixels to a metre on the pitch */
const PX_PER_M = 100

/** [row, column] on the keeper's sheet */
const K = {
  ready: [0, 0],
  shuffle: [0, 1],
  bounce: [0, 2],
  wave: [0, 3],
  armsUp: [0, 4],
  stand: [0, 5],
  lowDive: [1, 0],
  highDive: [1, 1],
  lying: [1, 2],
  jump: [1, 3],
  gather: [1, 4],
  caught: [1, 5],
  cheer: [2, 0],
  fist: [2, 1],
  ohNo: [2, 2],
  sat: [2, 3],
  flat: [2, 4],
  kneel: [2, 5],
} as const
/** [row, column] on the shooter's sheet */
const S = {
  stand: [0, 0],
  hips: [0, 1],
  breath: [0, 2],
  run: [[0, 3], [0, 4], [0, 5], [1, 0]],
  plant: [1, 1],
  strike: [1, 2],
  follow: [1, 3],
  /** after a goal: jump, knee slide, aeroplane, cupped ear, fist pump, pointing up */
  scored: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5]],
  /** after a miss or a save: hands on head, hands on knees, walking off, kicking the grass, flat on his back */
  missed: [[3, 0], [3, 1], [3, 4], [3, 5], [3, 2]],
  sat: [3, 3],
} as const
type Cell = readonly [number, number]

interface Fig {
  /** where the shadow sits on the pitch */
  x: number
  z: number
  cell: Cell
  /** mirrored: a dive or lean to the right */
  flip?: boolean
  /** leaning over, in degrees (about the feet) */
  rot?: number
}

function Sprite({ cam, fig, sheet, seat, boost = 1, dolly = 0 }: { cam: Cam; fig: Fig; sheet: keyof typeof SHEET; seat: Seat; boost?: number; dolly?: number }) {
  const sh = SHEET[sheet]
  const [sx, sy, k] = project(cam, fig.x, 0, fig.z, dolly)
  const s = (k * boost) / PX_PER_M
  const [r, c] = fig.cell
  return (
    <g transform={`translate(${sx} ${sy}) rotate(${fig.rot ?? 0}) scale(${fig.flip ? -s : s} ${s}) translate(${-sh.foot[0]} ${-sh.foot[1]})`}>
      <svg width={sh.w} height={sh.h} viewBox={`${c * sh.w} ${r * sh.h} ${sh.w} ${sh.h}`} overflow="hidden">
        <image href={sh.img[seat]} width={6 * sh.w} height={sh.rows * sh.h} />
      </svg>
    </g>
  )
}

/** a pose on a loop: the one for time t, each held for ms */
const cycle = <T,>(xs: readonly T[], t: number, ms: number) => xs[Math.floor(t / ms) % xs.length]

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

  /**
   * Online: the pick actually locked in (the last lock-in that landed). Lock-ins go one after another,
   * and the strike waits for any still on its way, so the pick shown is always the one locked in.
   */
  const locked = useRef<{ n: number; x?: number; y?: number; spot?: Spot; salt: string } | null>(null)
  const sending = useRef<Promise<unknown>>(Promise.resolve())
  /** your dive for this kick (you can change it until the strike) */
  const dive = useRef<{ n: number; spot: Spot; salt: string } | null>(null)
  const [dived, setDived] = useState<{ n: number; spot: Spot } | null>(null)
  /** your shot once you've let go; Ops' shot once she has */
  const shot = useRef<{ n: number; x: number; y: number; salt: string } | null>(null)
  const opsShotRef = useRef<{ n: number; x: number; y: number; salt: string } | null>(null)
  /** the aim while your finger is down: where it started, and the aim before the sway */
  const aim = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [aiming, setAiming] = useState(false)
  /** on easy, Ops in goal picks her dive at the whistle, and her keeper shifts that way (a tell) */
  const opsKeep = useRef<{ n: number; spot: Spot } | null>(null)
  const easyTells = vsOps && level === 'easy'
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

  const [howTo, setHowTo] = useState(() => vsOps && load(HOWTO_KEY) !== 'seen')

  // the first whistle: the host (or this phone, against Ops) sets it going (once How to play is closed)
  useEffect(() => {
    if (howTo || live.start || over || !(me.isHost || vsOps || session.local)) return
    session.move<ShootoutLive>((cur) => (cur.start || cur.result ? undefined : { ...cur, start: now() + 1500 })).catch(() => {})
  }, [howTo, live.start, over, me.isHost, vsOps, session, now])

  /** you let go: the aim (with its sway) is the shot, and the run-up starts */
  const release = useCallback(
    (x: number, y: number) => {
      const l = liveRef.current
      if (l.result || !l.start || l.strike || shooterOf(l.n, l.first) !== mine) return
      const n = l.n
      // rounded as the database keeps it, so the lock-in can be checked against what's shown
      const s = { n, x: toKept(x), y: toKept(y), salt: newSalt() }
      shot.current = s
      sound('tap')
      if (!online) {
        session.move<ShootoutLive>((cur) => shoot(cur, n, now() + RUN_MS)).catch(() => {})
        return
      }
      // online the shot goes as a lock-in with the strike; it only counts once that has landed
      sending.current = sending.current
        .then(async () => {
          const c = await shotCommit(n, s.x, s.y, s.salt)
          if (await session.move<ShootoutLive>((cur) => shoot(cur, n, now() + RUN_MS, c))) locked.current = s
        })
        .catch(() => {})
    },
    [mine, now, session, sound, online],
  )

  /** your dive (changeable until the strike) */
  const pickDive = useCallback(
    (spot: Spot) => {
      const l = liveRef.current
      const tt = now()
      if (l.result || !l.start || tt < l.start || shooterOf(l.n, l.first) === mine) return
      if (l.strike && tt >= l.strike) return
      const d = { n: l.n, spot, salt: newSalt() }
      dive.current = d
      setDived({ n: l.n, spot })
      sound('tap')
      // online every change is a new lock-in, one after another; the last one to land is the dive
      if (online)
        sending.current = sending.current
          .then(async () => {
            const c = await diveCommit(d.n, d.spot, d.salt)
            if (await session.move<ShootoutLive>((cur) => lockIn(cur, d.n, mine, c))) locked.current = d
          })
          .catch(() => {})
    },
    [mine, now, sound, online, session],
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
    // online, if the shooter's phone has gone quiet, the other phone sets the scuff going a little later
    const wait = opsShoots ? live.start + opsWait() - now() : live.start + AIM_MS + (shooter === mine ? 0 : CLAIM_MS) - now()
    const timer = setTimeout(() => {
      if (opsShoots) {
        opsShotRef.current = { n, ...opsShot(level, yourDives.current), salt: newSalt() }
      } else if (shooter === mine) {
        aim.current = null
        setAiming(false)
        shot.current = null
      } else if (!online) return
      // (refused if the shot went in meanwhile)
      sending.current = sending.current.then(() => session.move<ShootoutLive>((cur) => shoot(cur, n, now() + RUN_MS))).catch(() => {})
    }, Math.max(0, wait))
    return () => clearTimeout(timer)
  }, [live.n, live.start, live.strike, over, vsOps, shooter, mine, theirs, level, session, now])

  // the strike: both picks go in (Ops picks her dive now, from your habits)
  useEffect(() => {
    if (!live.strike || over) return
    const n = live.n
    /** what you show: your shot or your dive, or nothing (a scuff, standing still) */
    const shown = (p: { n: number; x?: number; y?: number; spot?: Spot; salt: string } | null): Reveal =>
      !p || p.n !== n ? NONE : shooter === mine ? { x: p.x, y: p.y, salt: p.salt } : { spot: p.spot, salt: p.salt }
    const timer = setTimeout(() => {
      if (online) {
        // show what's locked in, once any lock-in on its way has landed (or been turned away)
        sending.current = sending.current
          .then(() => session.move<ShootoutLive>((cur) => revealIn(cur, n, { [key(mine)]: shown(locked.current) })))
          .catch(() => {})
        return
      }
      const mineR = shown(shooter === mine ? shot.current : dive.current)
      const o = opsShotRef.current?.n === n ? opsShotRef.current : null
      const early = opsKeep.current?.n === n ? opsKeep.current.spot : null
      const opsR: Reveal = shooter === theirs ? (o ? { x: o.x, y: o.y, salt: o.salt } : NONE) : { spot: early ?? opsDive(level, yourShots.current), salt: newSalt() }
      session.move<ShootoutLive>((cur) => revealIn(cur, n, { [key(mine)]: mineR, [key(theirs)]: opsR })).catch(() => {})
    }, Math.max(0, live.strike - now()))
    // online, a phone that never shows its pick counts as showing nothing
    const claim = online
      ? setTimeout(() => {
          session.move<ShootoutLive>((cur) => (cur.n === n && !cur.reveal?.[key(theirs)] ? revealIn(cur, n, { [key(theirs)]: CLAIMED }) : undefined)).catch(() => {})
        }, Math.max(0, live.strike - now()) + REVEAL_WAIT_MS)
      : undefined
    return () => {
      clearTimeout(timer)
      if (claim) clearTimeout(claim)
    }
  }, [live.n, live.strike, over, vsOps, online, shooter, mine, theirs, level, session, now])

  // on easy, Ops in goal makes up her mind at the whistle (so her keeper can give it away)
  useEffect(() => {
    if (!easyTells || !live.start || over || shooter !== mine || opsKeep.current?.n === live.n) return
    opsKeep.current = { n: live.n, spot: opsDive(level, yourShots.current) }
  }, [easyTells, live.start, live.n, over, shooter, mine, level])

  // a kick settled: remember what you did (for Ops)
  const seen = useRef(live.last?.n ?? -1)
  useEffect(() => {
    const k = live.last
    if (!k || k.n === seen.current) return
    seen.current = k.n
    if (k.shooter === mine) yourShots.current.push(landing(k.x, k.y).spot)
    else if (k.reveal?.[key(mine)]?.spot !== undefined) yourDives.current.push(k.dive)
    // online: the other phone's pick has to be the one it locked in, and the outcome has to follow
    if (online)
      honest(k, theirs).then((ok) => {
        if (!ok) session.move<ShootoutLive>((cur) => (cur.result ? undefined : { ...cur, result: { winner: mine, why: 'foul' } })).catch(() => {})
      })
  }, [live.last, mine, theirs, online, session])

  // sounds: the whistle, the boot on the ball, the ball arriving (net, gloves, woodwork) and the crowd, full time
  const heard = useRef({ whistle: -1, strike: live.last?.strike ?? 0, land: live.last?.n ?? -1, over: over })
  useEffect(() => {
    const h = heard.current
    const k = live.last
    if (live.start && t >= live.start && h.whistle !== live.n && !over) {
      h.whistle = live.n
      sound('whistle')
    }
    // the strike may already be settled into the last kick by the time a frame sees it
    const strike = live.strike || k?.strike || 0
    if (strike && t >= strike && h.strike !== strike) {
      h.strike = strike
      sound('kick')
    }
    // the replay's own clock: slowed through a close call
    const kt = k ? k.strike + replayMs(k, t - k.strike) : t
    if (k && kt >= k.strike + FLIGHT_MS && h.land !== k.n) {
      h.land = k.n
      const o = k.outcome
      if (scored(o)) {
        sound('net')
        sound('roar')
      } else {
        sound(o === 'saved' || o === 'tips' ? 'glove' : o === 'post' || o === 'bar' ? 'post' : 'whoosh')
        sound('ooh')
      }
    }
    if (over && !h.over && k && kt >= k.strike + FLIGHT_MS + 900) {
      h.over = true
      sound('fullTime')
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

  const lostMatch = (s: Seat) => over && live.result?.winner !== s
  /** the replay's clock: the same as t, but slowed through the end of a close call's flight */
  const kt = last ? last.strike + replayMs(last, t - last.strike) : t
  const slowMo = !!last && closeCall(last) && kt - last.strike > FLIGHT_MS * 0.5 && kt - last.strike < FLIGHT_MS + 350

  /* the keeper: shuffling on his line (leaning toward your pick, on your phone), the dive, then how it went */
  const KEEP_Z = 0.6
  let keeper: Fig = { x: 0, z: KEEP_Z, cell: cycle([K.ready, K.shuffle, K.bounce, K.ready], t, 420) }
  if (!last && myDive !== null && cam === 'keeper') {
    const c = colOf(myDive)
    keeper = { x: c * 0.3, z: KEEP_Z, cell: isHigh(myDive) ? K.armsUp : c ? K.shuffle : K.ready, flip: c > 0 }
  } else if (last) {
    const dt = kt - last.strike
    const after = dt - FLIGHT_MS
    const c = colOf(last.dive)
    const high = isHigh(last.dive)
    const T = targetOf(last)
    const kept = last.outcome === 'saved' || last.outcome === 'tips'
    // a save: his gloves (about a metre past his body on a dive) meet the ball
    const to = c === 0 ? 0 : kept ? T.x - c * 1.0 : c * 1.6
    const flip = c > 0
    const x = lerp(0, to, ease(clamp(dt / (FLIGHT_MS * 0.9))))
    const sat = (cell: Cell) => (lostMatch((1 - last.shooter) as Seat) && after > 1400 ? K.sat : cell)
    if (dt < 110) keeper = { x: 0, z: KEEP_Z, cell: c ? K.shuffle : K.ready, flip }
    else if (c === 0) {
      // the middle: up for a high one, down to gather a low one
      let cell: Cell = high ? K.jump : K.gather
      if (after > 150) cell = kept ? (after > 700 ? cycle([K.cheer, K.fist], t, 380) : K.caught) : last.outcome === 'goal' || last.outcome === 'tipsIn' ? sat(after > 1100 ? K.kneel : K.ohNo) : K.fist
      keeper = { x, z: KEEP_Z, cell }
    } else {
      let cell: Cell = high ? K.highDive : K.lowDive
      if (after > 250) cell = K.lying
      if (kept && after > 750) cell = cycle([K.cheer, K.fist], t, 380)
      else if (!kept && (last.outcome === 'goal' || last.outcome === 'tipsIn') && after > 900) cell = sat(K.flat)
      else if (!kept && after > 700 && last.outcome !== 'goal' && last.outcome !== 'tipsIn') cell = K.fist
      keeper = { x, z: KEEP_Z, cell, flip: cell === K.lying || cell === K.lowDive || cell === K.highDive || cell === K.flat ? flip : false }
    }
  }

  /* the shooter: waiting by the ball, the run-up, the strike, then how it went */
  const runFrom = { x: -1.1, z: 13.6 }
  const runTo = { x: -0.32, z: 11.35 }
  let shooterFig: Fig = { x: runFrom.x, z: runFrom.z, cell: cycle([S.stand, S.hips, S.breath, S.stand], t, 1400) }
  if (last) {
    const dt = kt - last.strike
    const after = dt - FLIGHT_MS
    let cell: Cell = dt < 260 ? S.strike : S.follow
    if (after > 150) {
      if (scored(last.outcome)) cell = S.scored[last.n % S.scored.length]
      else cell = lostMatch(last.shooter) && after > 1200 ? S.sat : S.missed[last.n % S.missed.length]
      // the jump celebration bounces
      if (cell === S.scored[0]) cell = cycle([S.scored[0], S.stand], t, 300)
    }
    shooterFig = { x: runTo.x, z: runTo.z, cell }
  } else if (live.strike) {
    const u = clamp((t - (live.strike - RUN_MS)) / RUN_MS)
    // the easy tell: Ops leans toward the side she's going to as she runs up
    const o = opsShotRef.current
    const tell = easyTells && shooter === theirs && o?.n === live.n && Math.abs(o.x) > 1 / 3 && u > 0 && u < 0.86 ? Math.sign(o.x) * 13 : 0
    shooterFig = {
      x: lerp(runFrom.x, runTo.x, u),
      z: lerp(runFrom.z, runTo.z, u),
      cell: u >= 1 ? S.strike : u > 0.86 ? S.plant : u > 0 ? S.run[Math.floor(u * 9) % S.run.length] : S.stand,
      rot: tell,
    }
  }

  /* their keeper, seen from the spot: shuffling, waving his arms at you; on easy, shifting toward his dive */
  let facing: Fig = { x: 0, z: KEEP_Z, cell: cycle([K.ready, K.wave, K.ready, K.shuffle, K.bounce, K.ready], t, 450) }
  const giveaway = easyTells && opsKeep.current?.n === live.n && !last && live.start && t >= live.start + 900 ? opsKeep.current.spot : null
  if (giveaway !== null) {
    const c = colOf(giveaway)
    // from the spot his left is on your right: the sheet's lean goes to the left of the picture, so flip it for his left
    facing = { x: c * 0.35, z: KEEP_Z, cell: isHigh(giveaway) ? K.armsUp : c ? K.shuffle : K.ready, flip: c < 0 }
  }

  const ball = last ? ballOf(last, kt) : { x: 0, y: BALL_R, z: SPOT_Z }
  const dolly = cam === 'shooter' && live.strike ? 2.2 * ease(clamp((t - (live.strike - RUN_MS)) / RUN_MS)) : 0
  const aimNow = aiming && aim.current ? sway(aim.current.x, aim.current.y, t) : null
  const banner = last && kt >= last.strike + FLIGHT_MS + 60 ? last : null
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

      <div className={`so-stage${slowMo ? ' so-stage--slow' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div ref={worldEl} className="so-world" style={{ aspectRatio: `100 / ${H}` }}>
          <svg className="so-scene" viewBox={`0 0 100 ${H}`} aria-label={cam === 'keeper' ? 'The goal, from behind the keeper' : 'The goal, from behind the ball'}>
            {cam === 'keeper' ? (
              <KeeperView
                ball={ball}
                keeper={<Sprite cam="keeper" fig={keeper} sheet="keeper" seat={keeperSeat} boost={1.25} />}
                shooter={<Sprite cam="keeper" fig={shooterFig} sheet="shooter" seat={shooterSeat} boost={2.1} />}
                zones={!last && !iShoot ? { picked: myDive, open: picking } : null}
              />
            ) : (
              <ShooterView
                dolly={dolly}
                aim={aimNow}
                keeper={<Sprite cam="shooter" fig={facing} sheet="keeper" seat={keeperSeat} boost={1.1} dolly={dolly} />}
              />
            )}
          </svg>
        </div>

        {banner && (
          <div key={banner.n} className={`so-banner${bannerMine ? ' so-banner--mine' : ''}`} aria-hidden="true">
            {SAID[banner.outcome]}
          </div>
        )}
        {!last && !over && live.n < (easyTells ? 4 : 2) && live.start > 0 && t >= live.start && !struck && (
          <p className="so-hint" aria-hidden="true">
            {iShoot
              ? easyTells
                ? 'Drag to aim, let go to shoot · on easy, Ops shifts toward the side she’ll dive: aim the other way'
                : 'Drag to aim, let go to shoot · the aim sways more near the posts and the bar'
              : easyTells
                ? 'Tap where you’ll dive · on easy, Ops leans toward her side as she runs up'
                : 'Tap where you’ll dive (high or low, left, middle or right) · you can change it until the kick'}
          </p>
        )}
      </div>
      {howTo && (
        <HowTo
          onDone={() => {
            save(HOWTO_KEY, 'seen')
            setHowTo(false)
          }}
        />
      )}
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
      <ellipse className="so-pitch__spot" cx={spX} cy={spY} rx={0.11 * spK} ry={0.04 * spK} />
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
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, shootoutFeats(st.live))
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
