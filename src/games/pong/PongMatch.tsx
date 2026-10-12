import { ref as dbRef, set } from 'firebase/database'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../../lib/firebase'
import { useServerOffset } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { load, save } from '../../lib/storage'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, roomPath, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { MatchEnded } from '../../match/MatchEnded'
import { pingMoments } from '../../match/moments'
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
import { POINTS, RESULT_MS, awardPoint, callOf, freshLive, nextGame, pointKey, serverOf, type Live, type Side, type Why } from '../pingpong/engine'
import { LATE, ON_TIME, mirror, opsPlan, opsServeLane, plan, rebase, returnOf, timing, windowOf, type Flight, type Lane, type ShotMsg } from './engine'
import { pongFeats } from './feats'
import orangeSheet from './sprites/player.png'
import blueSheet from './sprites/player-blue.png'
import '../../styles/pong.css'

const GAME = 'pong'
/** set once you've been through the how-to on easy */
const HOWTO_KEY = 'lvs_pong_howto'
export const seriesLabel = (target: number) => (target === 1 ? 'Single game' : `Best of ${target * 2 - 1}`)

export interface PongState {
  /** games needed to win the match */
  target: number
  match: number
  live: Live & { shot?: ShotMsg }
  ready?: Record<string, boolean>
}

export function initialPongState(target = 2, match = 1): PongState {
  return { target, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Side) }
}

/*
 * The scene, in units: 100 wide, H tall (a phone held upright). You (side 0) stand below the table,
 * Ops (side 1) above it, each on a left or right spot. The table sits in the middle, seen from above
 * and a little in front, with its net across the middle.
 */
const H = 178
const TABLE = { x0: 34, x1: 66, y0: 72, y1: 106 }
const NET_Y = (TABLE.y0 + TABLE.y1) / 2
/** where each end's player stands (feet), left and right */
const FEET_Y: Record<Side, number> = { 0: 132, 1: 60 }
const LANE_X = 21
const feetX = (lane: Lane) => 50 + lane * (50 - LANE_X)
/** where the ball meets each end's bat, and where it lands on each half */
const contactAt = (s: Side, lane: Lane) => ({ x: 50 + lane * 22, y: s === 0 ? 116 : 46 })
const bounceAt = (s: Side, lane: Lane) => ({ x: 50 + lane * 9, y: s === 0 ? 97 : 81 })

/** the poses on the sprite sheet: [row, column] */
type Pose = readonly [number, number]
const P = {
  ready: [0, 0],
  bounce: [0, 1],
  shuffleL: [0, 2],
  shuffleL2: [0, 3],
  shuffleR: [0, 4],
  shuffleR2: [0, 5],
  // on the right of the sheet's figure: wind-up, swing, contact, follow-through, stretch, recover
  right: [[1, 1], [1, 2], [1, 3], [1, 5]],
  rightStretch: [1, 4],
  left: [[2, 1], [2, 2], [2, 3], [2, 5]],
  leftStretch: [2, 4],
  toss: [3, 0],
  tossUp: [3, 1],
  smash: [3, 2],
  overhead: [3, 3],
  miss: [3, 4],
  sweat: [3, 5],
  dance: [4, 0],
  flex: [4, 1],
  jump: [4, 2],
  slump: [4, 3],
  kneel: [4, 4],
  curled: [4, 5],
} as const
const COLS = 6
const ROWS = 5
/** a cell on the sheet is 256×224 with the shadow's middle at (128, 210); the figure in it is drawn this tall in scene units */
const CELL_W = 43
const CELL_H = (CELL_W * 224) / 256
const FOOT = { x: 128 / 256, y: 210 / 224 }

type Act =
  | { kind: 'idle' }
  | { kind: 'serve' }
  | { kind: 'swing'; side: Lane; at: number; smash: boolean }
  | { kind: 'stretch'; side: Lane; at: number }
  | { kind: 'sweat' }
  | { kind: 'point'; won: boolean; game: boolean; final: boolean }

/** the pose for what a player is doing, `side` being the side of the screen it's on */
function poseOf(act: Act, t: number, flip: boolean): Pose {
  // the far player is drawn mirrored, so their screen-left is the sheet's right
  const sheetSide = (side: Lane) => ((flip ? -side : side) > 0 ? P.right : P.left)
  switch (act.kind) {
    case 'idle':
      return Math.floor(t / 420) % 2 ? P.bounce : P.ready
    case 'serve':
      return Math.floor(t / 520) % 2 ? P.tossUp : P.toss
    case 'swing': {
      const e = t - act.at
      if (act.smash) return e < 140 ? P.overhead : e < 360 ? P.smash : e < 520 ? sheetSide(act.side)[3] : P.ready
      const f = sheetSide(act.side)
      return e < 60 ? f[0] : e < 190 ? f[1] : e < 330 ? f[2] : e < 470 ? f[3] : P.ready
    }
    case 'stretch': {
      const e = t - act.at
      return e < 520 ? ((flip ? -act.side : act.side) > 0 ? P.rightStretch : P.leftStretch) : P.miss
    }
    case 'sweat':
      return P.sweat
    case 'point':
      if (act.final) return act.won ? (Math.floor(t / 380) % 2 ? P.flex : P.jump) : P.curled
      if (act.game) return act.won ? (Math.floor(t / 380) % 2 ? P.flex : P.dance) : P.kneel
      return act.won ? P.dance : P.slump
  }
}

/** where the ball is: across the floor (x, y) and how high it is (z), in scene units */
function ballAt(f: Flight, t: number) {
  const recv = (1 - f.by) as Side
  const a = contactAt(f.by, f.from)
  const end = contactAt(recv, f.to)
  let b = bounceAt(recv, f.to)
  if (f.fault === 'net') b = { x: (a.x + b.x) / 2, y: NET_Y }
  // long: it flies right over the other half and lands off the end
  if (f.fault === 'long') b = { x: b.x + f.to * 6, y: recv === 0 ? TABLE.y1 + 14 : TABLE.y0 - 14 }
  const lift = f.smash ? 5 : f.serve ? 9 : 13
  if (t <= f.tb) {
    const u = Math.max(0, (t - f.t0) / (f.tb - f.t0))
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: 4 * lift * u * (1 - u) + (f.fault === 'net' ? 3 * u : 0) }
  }
  if (f.fault === 'net') {
    // it drops off the net
    const u = Math.min(1, (t - f.tb) / 260)
    return { x: b.x, y: b.y + (f.by === 0 ? 1.5 : -1.5) * u, z: 3 * (1 - u * u) }
  }
  if (f.fault === 'long') {
    const u = Math.min(1, (t - f.tb) / 240)
    return { x: b.x, y: b.y, z: 3 * Math.sin(Math.PI * u) }
  }
  // after the bounce, on to the bat (and on past it, if nobody gets there)
  const u = (t - f.tb) / (f.t1 - f.tb)
  return { x: b.x + (end.x - b.x) * u, y: b.y + (end.y - b.y) * u, z: Math.max(0, 4 * 5 * u * (1 - u)) }
}

const WHY_SAID: Record<Why, string> = { miss: 'Missed it', net: 'Into the net', long: 'Long', wide: 'Wide', winner: 'Winner' }
const poss = (n: string) => (n.endsWith('s') ? `${n}’` : `${n}’s`)

type Phase = 'idle' | 'serve-me' | 'serve-them' | 'rally' | 'point'

export function PongMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as PongState
  const live = st.live
  const session = useSession(GAME, room.code)
  const vsOps = !!session.bot
  const online = !session.local && !vsOps
  const level = session.level ?? 'medium'
  /** the ring and the lit side are for learning: easy Ops only */
  const assists = vsOps && level === 'easy'
  const { play: sound } = useSound()
  const seats = playersBySeat(room)
  // you're always at the near end (side 0); seat 1 online sees the table turned round
  const flip = me.seat === 1
  const seatOf = useCallback((s: Side): Side => (flip ? ((1 - s) as Side) : s), [flip])
  const opp = seats[seatOf(1)]
  const oppName = opp?.name ?? 'Ops'

  const seriesOver = live.games[0] >= st.target || live.games[1] >= st.target
  const showResults = useHold(seriesOver, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !seriesOver
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, online ? opp : null, inMatch)
  const offset = useServerOffset()
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const liveRef = useRef(live)
  liveRef.current = live
  // the rally lives here, outside React, on a clock that only runs while the page is showing
  const rally = useRef({
    phase: 'idle' as Phase,
    clock: 0,
    flight: null as Flight | null,
    serveAt: 0,
    /** each end's spot, where its player is drawn (sliding there), and what they're doing */
    lane: [-1, 1] as [Lane, Lane],
    x: [feetX(-1), feetX(1)] as [number, number],
    act: [{ kind: 'idle' }, { kind: 'idle' }] as [Act, Act],
    /** a tap that hit nothing: no swinging again until this */
    cool: 0,
    /** a ball you let past: you never tapped, or tapped the wrong side (for the banner) */
    missed: null as 'late' | 'wrong' | null,
    wrongAt: null as Flight | null,
    /** Ops' answer to the ball heading her way */
    ops: null as ReturnType<typeof opsPlan> | null,
    bounced: null as Flight | null,
    /** online: the other phone's latest shot, waiting to be played here */
    inbox: null as ShotMsg | null,
    /** the how-to is up: the rally waits */
    paused: false,
    /** where the ball has just been, for the line behind it */
    trail: [] as { x: number; y: number }[],
  })
  const ballEl = useRef<HTMLDivElement>(null)
  const shadowEl = useRef<HTMLDivElement>(null)
  const trailEl = useRef<SVGPolylineElement>(null)
  const ringEl = useRef<SVGCircleElement>(null)
  const sideEls = useRef<(HTMLSpanElement | null)[]>([null, null])
  const figEls = useRef<(HTMLDivElement | null)[]>([null, null])
  const [prompt, setPrompt] = useState('')
  const [banner, setBanner] = useState<{ text: string; mine: boolean; n: number } | null>(null)
  const [pow, setPow] = useState<{ n: number; mine: boolean } | null>(null)
  const [hint, setHint] = useState(true)
  const [howTo, setHowTo] = useState(() => assists && load(HOWTO_KEY) !== 'seen')
  rally.current.paused = howTo

  const nextServe = useCallback(() => {
    const l = liveRef.current
    const r = rally.current
    r.flight = null
    r.ops = null
    r.trail = []
    if (l.result) {
      r.phase = 'idle'
      return
    }
    r.act = [{ kind: 'idle' }, { kind: 'idle' }]
    if (seatOf(serverOf(l)) === 0) {
      r.phase = 'serve-me'
      r.act[0] = { kind: 'serve' }
      setPrompt('Your serve · tap a side')
    } else {
      r.phase = 'serve-them'
      r.act[1] = { kind: 'serve' }
      // Ops serves after a moment; a friend's serve arrives as a message
      r.serveAt = r.clock + 900
      setPrompt(`${oppName} to serve`)
    }
  }, [oppName, seatOf])

  const point = useCallback(
    (winner: Side, why: Why, hits: number) => {
      const r = rally.current
      if (r.phase === 'point') return
      r.phase = 'point'
      setPrompt('')
      const key = pointKey(liveRef.current)
      session.move<Live>((cur) => (pointKey(cur) === key ? awardPoint(cur, seatOf(winner), why, st.target, hits) : undefined)).catch(() => {})
    },
    [session, st.target, seatOf],
  )

  // a point went in: the banner, both players react, then the next serve
  const pointSeen = useRef(`${live.game}:${live.last?.n ?? 0}`)
  useEffect(() => {
    const key = `${live.game}:${live.last?.n ?? 0}`
    if (key === pointSeen.current || !live.last) return
    pointSeen.current = key
    const r = rally.current
    r.phase = 'point'
    r.inbox = r.inbox && r.inbox.pt === pointKey(live) ? r.inbox : null
    const { why } = live.last
    const mine = seatOf(live.last.winner) === 0
    const game = !!live.result
    const final = !!live.result?.final
    r.act = [
      { kind: 'point', won: mine, game, final },
      { kind: 'point', won: !mine, game, final },
    ]
    sound(mine ? 'find' : 'error')
    const n = Date.now()
    const yours = why === 'miss' && r.missed ? (r.missed === 'wrong' ? 'Wrong side' : assists ? 'Too late · tap as it reaches the ring' : 'Too late') : WHY_SAID[why]
    r.missed = null
    const text = mine ? `Your point · ${why === 'miss' || why === 'winner' ? `${oppName} missed it` : `${oppName}: ${WHY_SAID[why].toLowerCase()}`}` : `${poss(oppName)} point · ${yours}`
    setBanner({ text, mine, n })
    setPrompt('')
    setTimeout(() => {
      setBanner((b) => (b?.n === n ? null : b))
      // (after the last point nextServe just stands the rally down, ready for a rematch)
      if (rally.current.phase === 'point') nextServe()
    }, 1100)
  }, [live, oppName, sound, nextServe, seatOf, assists])

  // a new game (or a fresh match): get the first serve ready
  useEffect(() => {
    if (!live.result && rally.current.phase === 'idle') nextServe()
  }, [live.game, live.result, st.match, nextServe])

  // a finished game: pause, then the next one (the match ends on the results screen)
  useEffect(() => {
    if (!live.result || live.result.final) return
    const finished = live.game
    const t = setTimeout(() => session.move<Live>((cur) => nextGame(cur, finished)).catch(() => {}), RESULT_MS)
    return () => clearTimeout(t)
  }, [session, live.result, live.game])
  useEffect(() => {
    if (!live.result) return
    const w = live.result.winner
    const [hi, lo] = [live.points[w], live.points[1 - w]]
    setPrompt(live.result.final ? '' : `Game · ${seatOf(w) === 0 ? 'you' : oppName} ${hi}–${lo}${lo === 0 ? ' raw' : ''}`)
  }, [live.result, live.points, oppName, seatOf])

  // online: the other phone's shot comes in, to be played on the next frame
  const shotSeen = useRef(live.shot?.id)
  useEffect(() => {
    const s = live.shot
    if (!online || !s || s.id === shotSeen.current) return
    shotSeen.current = s.id
    if (s.by !== me.seat) rally.current.inbox = s
  }, [online, live.shot, me.seat])

  /** online: your shot goes to the other phone (in seat 0's view, its times counted from the hit) */
  const send = useCallback(
    (f: Flight) => {
      const w = flip ? mirror(f) : f
      const rel: Flight = { ...w, t0: 0, tb: w.tb - w.t0, t1: w.t1 - w.t0 }
      const msg: ShotMsg = { id: Math.random().toString(36).slice(2, 10), by: me.seat as Side, at: Date.now() + offsetRef.current, pt: pointKey(liveRef.current), f: rel }
      shotSeen.current = msg.id
      set(dbRef(db, `${roomPath(GAME, room.code)}/state/live/shot`), msg).catch(() => {})
    },
    [flip, me.seat, room.code],
  )

  /** a shot goes off: its flight, Ops' answer if it's heading her way, the sound */
  const launch = useCallback(
    (f: Flight) => {
      const r = rally.current
      r.flight = f
      r.bounced = null
      r.phase = 'rally'
      r.ops = vsOps && f.by === 0 && !f.fault ? opsPlan(level, f) : null
      if (f.by === 0) {
        if (online) send(f)
        // the other player heads for the ball's side as soon as it's hit (and sweats at a smash)
        if (!f.fault) r.lane[1] = f.to
        if (f.smash) r.act[1] = { kind: 'sweat' }
      }
      sound(f.smash ? 'smash' : 'pong')
      if (f.smash) {
        const n = Date.now()
        setPow({ n, mine: f.by === 0 })
        setTimeout(() => setPow((p) => (p?.n === n ? null : p)), 700)
      }
    },
    [level, sound, vsOps, online, send],
  )

  /** a tap on a side of the screen: serve to it, or swing at a ball coming to it */
  const tap = useCallback(
    (side: Lane) => {
      const r = rally.current
      const t = r.clock
      if (r.paused) return
      if (r.phase === 'serve-me') {
        r.act[0] = { kind: 'swing', side: r.lane[0], at: t, smash: false }
        setPrompt('')
        launch(plan(0, r.lane[0], side, t, 1, { serve: true }))
        return
      }
      if (r.phase !== 'rally' || t < r.cool) return
      const f = r.flight
      r.lane[0] = side
      const coming = f && f.by === 1 && !f.fault ? f : null
      const d = coming ? timing(coming, t) : null
      if (coming && d !== null && side === coming.to) {
        const ret = returnOf(d, side)
        r.act[0] = { kind: 'swing', side, at: t, smash: ret.smash }
        setHint(false)
        launch(plan(0, side, ret.to, t, coming.hits + 1, { smash: ret.smash, fault: ret.fault }))
        return
      }
      // before the bounce (or with nothing coming) a tap just steps you over to that side, free
      if (!coming || t < coming.tb) return
      // the wrong side while it's there to hit: a swing at nothing, and it costs a moment
      r.act[0] = { kind: 'swing', side, at: t, smash: false }
      r.wrongAt = coming
      r.cool = t + 150
    },
    [launch],
  )

  // keys on a computer: left and right arrows (or A and D)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'ArrowLeft' || e.key === 'a') tap(-1)
      else if (e.key === 'ArrowRight' || e.key === 'd') tap(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tap])

  // the frame loop: Ops plays, the ball flies, points are judged, everyone is drawn
  useEffect(() => {
    if (showResults) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(50, now - last)
      last = now
      const r = rally.current
      if (r.paused) return
      r.clock += dt
      const t = r.clock

      if (vsOps && r.phase === 'serve-them' && t >= r.serveAt) {
        r.act[1] = { kind: 'swing', side: r.lane[1], at: t, smash: false }
        launch(plan(1, r.lane[1], opsServeLane(), t, 1, { serve: true }))
        setPrompt('')
      }

      // online: the other phone's shot (or serve) for this point starts flying here
      const msg = r.inbox
      if (msg && msg.pt === pointKey(liveRef.current) && (r.phase === 'serve-them' || (r.phase === 'rally' && r.flight?.by === 0))) {
        r.inbox = null
        const mine = flip ? mirror(msg.f) : msg.f
        const late = Math.max(0, Math.min(1500, Date.now() + offsetRef.current - msg.at))
        const g = rebase(mine, t, late)
        r.lane[1] = g.from
        r.act[1] = { kind: 'swing', side: g.from, at: t, smash: g.smash }
        launch(g)
        setPrompt('')
      }

      const f = r.flight
      if (r.phase === 'rally' && f) {
        if (t >= f.tb && r.bounced !== f && !f.fault) {
          r.bounced = f
          sound('ping')
        }
        const recv = (1 - f.by) as Side
        // only the phone the ball is heading to judges it (vs Ops, this phone judges both ends)
        if (f.fault && t >= f.tb + 260) {
          if (vsOps || recv === 0) point(recv, f.fault, f.hits)
        } else if (vsOps && !f.fault && recv === 1) {
          const ops = r.ops
          const w = windowOf(f)
          if (ops && ops !== 'miss' && 'd' in ops && t >= f.t1 + ops.d * w) {
            const ret = returnOf(ops.d, f.to, () => 1)
            r.act[1] = { kind: 'swing', side: f.to, at: t, smash: ret.smash }
            launch(plan(1, f.to, ret.to, t, f.hits + 1, { smash: ret.smash }))
          } else if (ops && ops !== 'miss' && 'swingFault' in ops && t >= f.t1) {
            r.act[1] = { kind: 'swing', side: f.to, at: t, smash: false }
            launch(plan(1, f.to, (-f.to) as Lane, t, f.hits + 1, { fault: ops.swingFault }))
          } else if (ops === 'miss' && t >= f.t1 - w * 0.3 && r.act[1].kind !== 'stretch') {
            r.act[1] = { kind: 'stretch', side: f.to, at: t }
          } else if (ops === 'miss' && t >= f.t1 + w * LATE) point(0, 'miss', f.hits)
        } else if (!f.fault && recv === 0 && t >= f.t1 + windowOf(f) * LATE) {
          r.act[0] = { kind: 'stretch', side: f.to, at: t }
          r.missed = r.wrongAt === f ? 'wrong' : 'late'
          point(1, 'miss', f.hits)
        }
      }

      // the players slide to their spots
      for (const s of [0, 1] as Side[]) {
        const target = feetX(r.lane[s])
        const gap = target - r.x[s]
        r.x[s] += gap * Math.min(1, dt / (s === 0 ? 55 : level === 'easy' ? 110 : 80))
        const el = figEls.current[s]
        if (!el) continue
        const sliding = Math.abs(gap) > 4 && (r.act[s].kind === 'idle' || r.act[s].kind === 'serve')
        const pose: Pose = sliding
          ? gap < 0
            ? Math.floor(t / 110) % 2 ? P.shuffleL : P.shuffleL2
            : Math.floor(t / 110) % 2 ? P.shuffleR : P.shuffleR2
          : poseOf(r.act[s], t, s === 1)
        // a swing that's done settles back to ready
        if (r.act[s].kind === 'swing' && t - (r.act[s] as { at: number }).at > 520) r.act[s] = { kind: 'idle' }
        el.style.backgroundPosition = `${(pose[1] / (COLS - 1)) * 100}% ${(pose[0] / (ROWS - 1)) * 100}%`
        el.style.left = `${r.x[s] - CELL_W * FOOT.x}%`
      }

      // the ring where a ball coming at you will reach your bat: it closes in as the ball comes,
      // opens (solid) once you can hit it and lights up when it's right on time; that side's letter lights too
      const coming = assists && r.phase === 'rally' && f && f.by === 1 && !f.fault && t <= f.t1 + windowOf(f) * LATE ? f : null
      const ring = ringEl.current
      if (ring) {
        if (!coming) ring.style.opacity = '0'
        else {
          const c = contactAt(0, coming.to)
          const u = Math.max(0, Math.min(1, (coming.t1 - t) / (coming.t1 - coming.t0)))
          ring.setAttribute('cx', String(c.x))
          ring.setAttribute('cy', String(c.y))
          ring.setAttribute('r', (2.6 + 11 * u).toFixed(2))
          ring.style.opacity = '1'
          const d = timing(coming, t)
          ring.classList.toggle('pong-ring--open', d !== null)
          ring.classList.toggle('pong-ring--now', d !== null && Math.abs(d) <= ON_TIME)
        }
      }
      sideEls.current.forEach((el, i) => el?.classList.toggle('pong-side--on', !!coming && coming.to === (i === 0 ? -1 : 1)))

      // the ball, its shadow and the line it leaves
      const ball = ballEl.current
      const shadow = shadowEl.current
      const show = r.phase === 'rally' || r.phase === 'point' ? f : null
      if (ball && shadow) {
        if (!show || t > show.t1 + 600) {
          ball.style.opacity = '0'
          shadow.style.opacity = '0'
          r.trail = []
        } else {
          const p = ballAt(show, Math.min(t, show.t1 + 600))
          ball.style.opacity = '1'
          ball.style.left = `${p.x}%`
          ball.style.top = `${((p.y - p.z) / H) * 100}%`
          ball.classList.toggle('pong-ball--hot', show.smash)
          shadow.style.opacity = '1'
          shadow.style.left = `${p.x}%`
          shadow.style.top = `${(p.y / H) * 100}%`
          r.trail.push({ x: p.x, y: p.y - p.z })
          if (r.trail.length > 9) r.trail.shift()
        }
        trailEl.current?.setAttribute('points', r.trail.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '))
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [showResults, launch, point, sound, level, vsOps, flip, assists])

  /* ── screens ── */

  const server = live.result ? null : serverOf(live)
  const card = (s: Side) => <ScoreCard p={seats[s]} you={s === me.seat} turn={server === s} value={live.points[s]} meta={`Games ${live.games[s]} · first to ${st.target}`} />

  if (abandoned && !seriesOver) {
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

  const figure = (s: Side) => (
    <div
      ref={(el) => void (figEls.current[s] = el)}
      className={`pong-fig pong-fig--${s === 0 ? 'near' : 'far'}`}
      style={{
        backgroundImage: `url(${seatOf(s) === 0 ? orangeSheet : blueSheet})`,
        top: `${((FEET_Y[s] - CELL_H * FOOT.y) / H) * 100}%`,
        width: `${CELL_W}%`,
      }}
      aria-hidden="true"
    />
  )

  return (
    <main className="pong">
      <div className="mt-hud">
        {card(0)}
        <div className="pong-game">
          <span className="label">Game {live.game}</span>
          <span className="pong-to">{live.result ? 'Game' : (callOf(live.points) ?? `to ${POINTS}`)}</span>
        </div>
        {card(1)}
      </div>
      <p className={`pong-status${prompt.startsWith('Your') ? ' pong-status--you' : ''}${prompt ? '' : ' pong-status--quiet'}`} role="status">
        {prompt || ' '}
      </p>

      <div
        className="pong-stage"
        onPointerDown={(e) => {
          e.preventDefault()
          tap(e.clientX < window.innerWidth / 2 ? -1 : 1)
        }}
      >
        <div className="pong-world" style={{ aspectRatio: `100 / ${H}` }}>
          <span ref={(el) => void (sideEls.current[0] = el)} className="pong-side pong-side--l" aria-hidden="true">L</span>
          <span ref={(el) => void (sideEls.current[1] = el)} className="pong-side pong-side--r" aria-hidden="true">R</span>
          {figure(1)}
          <svg className="pong-scene" viewBox={`0 0 100 ${H}`} aria-label="The table">
            <Table />
            <polyline ref={trailEl} className="pong-trail" points="" />
            <circle ref={ringEl} className="pong-ring" r="3" style={{ opacity: 0 }} />
          </svg>
          <div ref={shadowEl} className="pong-shadow" style={{ opacity: 0 }} />
          {figure(0)}
          <div ref={ballEl} className="pong-ball" style={{ opacity: 0 }} />
        </div>

        {banner && (
          <div key={banner.n} className={`pong-banner${banner.mine ? ' pong-banner--mine' : ''}`} aria-hidden="true">
            {banner.text}
          </div>
        )}
        {pow && (
          <div key={pow.n} className={`pong-pow${pow.mine ? ' pong-pow--mine' : ''}`} aria-hidden="true">
            Smash!
          </div>
        )}
        {hint && !howTo && (
          <p className="pong-hint" aria-hidden="true">
            {assists
              ? 'Tap the side the ball is coming to (it lights up) as the ball reaches the ring · on time smashes'
              : 'Tap the side the ball is coming to as it reaches you · early goes across, late down the line, on time smashes'}
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

/** the table from above and a little in front: its top with the lines, the net, the front edge and legs */
function Table() {
  const { x0, x1, y0, y1 } = TABLE
  return (
    <g className="pong-table">
      <rect x={x0 - 1} y={y0 + 2} width={x1 - x0 + 2} height={y1 - y0 + 12} className="pong-table__under" />
      <line x1={x0 + 2} y1={y1 + 3} x2={x0 + 2} y2={y1 + 12} />
      <line x1={x1 - 2} y1={y1 + 3} x2={x1 - 2} y2={y1 + 12} />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="pong-table__top" />
      <rect x={x0} y={y1} width={x1 - x0} height={2.4} className="pong-table__top" />
      <line x1={50} y1={y0} x2={50} y2={y1} />
      <rect x={x0 - 3} y={NET_Y - 2.4} width={x1 - x0 + 6} height={4.2} className="pong-table__net" />
      <line x1={x0 - 3} y1={NET_Y - 0.2} x2={x1 + 3} y2={NET_Y - 0.2} />
    </g>
  )
}

/*
 * How to play, acted out: a ball comes over to the right, that side lights up, the ring closes in
 * on the bat and a thumb taps the right half just as the ball meets it. Three steps underneath.
 */
/** the scene the how-to acts out on a loop (also at the top of How to play in the lobby) */
export function PongDemo() {
  return (
    <div className="pong-howto__demo" aria-hidden="true">
      <svg viewBox="0 0 100 56">
        <rect x="36" y="6" width="28" height="30" className="pong-howto__table" />
        <line x1="33" y1="21" x2="67" y2="21" className="pong-howto__net" />
        <line x1="50" y1="6" x2="50" y2="36" className="pong-howto__line" />
        <circle cx="72" cy="44" r="2.6" className="pong-howto__ring" />
        <circle cx="42" cy="2" r="2" className="pong-howto__ball" />
      </svg>
      <span className="pong-howto__l">L</span>
      <span className="pong-howto__r">R</span>
      <span className="pong-howto__half" />
      <span className="pong-howto__thumb" />
    </div>
  )
}

function HowTo({ onDone }: { onDone: () => void }) {
  return (
    <div className="pong-howto" role="dialog" aria-label="How to play" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pong-howto__card">
        <p className="label">How to play</p>
        <PongDemo />
        <ol className="pong-howto__steps">
          <li>
            <b>Watch the letters.</b> The side the ball is coming to lights up.
          </li>
          <li>
            <b>Wait for the ring.</b> It closes in where the ball will reach you.
          </li>
          <li>
            <b>Tap that half of the screen</b> as the ball reaches the ring. Right on time is a smash.
          </li>
        </ol>
        <button type="button" className="btn btn--primary btn--block" onClick={onDone}>
          Got it
        </button>
      </div>
    </div>
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: PongState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const g = st.live.games
  const winner = (g[0] >= st.target ? 0 : 1) as Side
  const iWon = winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]

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
    session.start({ ...initialPongState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, pongFeats(st.live), pingMoments(st.live))
  const scoreLine = `${g[0]} — ${g[1]}`
  const history = st.live.history ?? []
  const card: CardInput = {
    game: 'Ping Pong',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(g[k]), meta: 'games won' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: history.map((h, i) => ({ word: `Game ${i + 1}`, seat: h[0] > h[1] ? 0 : 1, note: `${h[0]}–${h[1]}` })) },
  }

  return (
    <main className="pong pong-results screen-in">
      {iWon && <Confetti />}
      <div className="pong-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match} · {seriesLabel(st.target).toLowerCase()}
        </p>
        <h1 className={`pong-results__title${iWon ? ' pong-results__title--win' : ''}`}>{iWon ? 'You win' : `${seats[winner]?.name ?? 'Ops'} wins`}</h1>
        <p className="pong-results__line">
          {g[0]} <span>—</span> {g[1]}
        </p>
        {history.length > 0 && <p className="pong-results__games">{history.map((h) => `${h[0]}–${h[1]}`).join(' · ')}</p>}
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={g[0]} meta="Games" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={g[1]} meta="Games" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Ping Pong', GAME, names, winner, scoreLine)}
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
