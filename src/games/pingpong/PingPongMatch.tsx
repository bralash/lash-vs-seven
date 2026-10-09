import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import type { CardInput } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useRivalry } from '../../match/useRivalry'
import {
  BAT_REACH,
  BAT_X,
  BAT_Y,
  GONE_Y,
  HIT_Y,
  NET_Y,
  POINTS,
  RESULT_MS,
  SERVE_Y,
  SMASH_PUSH,
  SMASH_Z,
  awardPoint,
  ballAt,
  batErr,
  contact,
  freshLive,
  nextGame,
  opsReturn,
  opsServe,
  plan,
  readStroke,
  readSwipe,
  serverOf,
  type Flight,
  type Live,
  type Side,
  type Why,
} from './engine'
import '../../styles/pingpong.css'

const GAME = 'pingpong'
/** "Single game" / "Best of 3" from the number of games needed */
export const seriesLabel = (target: number) => (target === 1 ? 'Single game' : `Best of ${target * 2 - 1}`)

export interface PPState {
  /** games needed to win the match */
  target: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialPPState(target = 2, match = 1): PPState {
  return { target, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Side) }
}

/* ── drawing: the table seen from above, a little perspective so the far end narrows ── */

const VW = 300
// room under your end of the table for your thumb, so the bat stays in sight above it
const VH = 575
const NEAR_Y = 418
const FAR_Y = 78
const NEAR_HALF = 128
const FAR_HALF = 92

/** your bat moves this much further than your thumb, so short movements cover your whole half */
const GAIN = 1.9

/** table coordinates (x -1…1, y 0…1, z height) to the drawing */
function proj(x: number, y: number, z = 0) {
  const half = NEAR_HALF + (FAR_HALF - NEAR_HALF) * y
  const s = half / NEAR_HALF
  return { px: VW / 2 + x * half, py: NEAR_Y - y * (NEAR_Y - FAR_Y) - z * 70 * s, s }
}
const corner = (x: number, y: number) => {
  const p = proj(x, y)
  return `${p.px},${p.py}`
}

const WHY_SAID: Record<Why, string> = { miss: 'Missed it', net: 'Into the net', long: 'Long', wide: 'Wide', winner: 'Winner' }

type Phase = 'serve-me' | 'serve-ops' | 'flight' | 'point' | 'idle'

export function PingPongMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as PPState
  const live = st.live
  const session = useSession(GAME, room.code)
  const level = session.level ?? 'medium'
  const { play: sound } = useSound()
  const seats = playersBySeat(room)

  const seriesOver = live.games[0] >= st.target || live.games[1] >= st.target
  const showResults = useHold(seriesOver, RESULT_MS)
  const inMatch = !seriesOver
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)

  // the rally lives here, outside React: a clock that only runs while the page is showing
  const liveRef = useRef(live)
  liveRef.current = live
  const rally = useRef({
    phase: 'idle' as Phase,
    flight: null as Flight | null,
    pinged: null as Flight | null,
    clock: 0,
    serveAt: 0,
    /** your bat: across the table, and how near the net (it stays wherever you leave it) */
    myX: 0,
    myY: SERVE_Y,
    /** the incoming ball's depth against your bat's last frame, to catch the moment they meet */
    rel: null as { f: Flight; d: number } | null,
    opsX: 0,
    swingAt: -1e9,
    opsSwingAt: -1e9,
    /** the shot Ops couldn't get to: she lunges for `lunge` and it goes past her */
    late: null as Flight | null,
    lunge: 0,
    /** the ball squashing on the table, and the puff of chalk where it landed */
    bounceAt: -1e9,
    puff: { x: 0, y: 0 },
    /** the spin showing on the ball: its seam's turn (sidespin) and tumble (top/backspin) */
    turn: 0,
    tumble: 0,
    /** where the ball has just been, for the streak behind a fast one */
    trail: [] as { px: number; py: number; s: number }[],
    /** a high ball sitting up for you right now ('Smash it!' showing) */
    sitter: false,
    /** the last swing was a smash: a bigger swing */
    big: false,
  })
  const faceEl = useRef<SVGCircleElement>(null)
  const [pow, setPow] = useState<{ n: number; mine: boolean } | null>(null)
  /** a smash: the crack, the table jolts, the word stamped on it */
  const smashed = useCallback(
    (mine: boolean) => {
      sound('smash')
      const n = Date.now()
      setPow({ n, mine })
      setTimeout(() => setPow((p) => (p?.n === n ? null : p)), 700)
      tableEl.current?.animate?.([{ translate: '0 0' }, { translate: '-4px 3px' }, { translate: '3px -2px' }, { translate: '0 0' }], { duration: 220 })
    },
    [sound],
  )
  const guideEl = useRef<SVGEllipseElement>(null)
  const tableEl = useRef<SVGSVGElement>(null)
  const ballEl = useRef<SVGGElement>(null)
  const seamEl = useRef<SVGGElement>(null)
  const puffEl = useRef<SVGCircleElement>(null)
  const trailEls = useRef<(SVGCircleElement | null)[]>([])
  const shadowEl = useRef<SVGEllipseElement>(null)
  const myPad = useRef<SVGGElement>(null)
  const opsPad = useRef<SVGGElement>(null)
  const [prompt, setPrompt] = useState('')
  const [banner, setBanner] = useState<{ text: string; mine: boolean; n: number } | null>(null)
  const [hint, setHint] = useState(true)

  /** set up the next serve from the match state */
  const nextServe = useCallback(() => {
    const l = liveRef.current
    const r = rally.current
    if (l.result) {
      r.phase = 'idle'
      return
    }
    r.flight = null
    r.late = null
    if (serverOf(l) === 0) {
      r.phase = 'serve-me'
      setPrompt('Your serve · flick up')
    } else {
      r.phase = 'serve-ops'
      r.serveAt = r.clock + 900
      setPrompt('Ops to serve')
    }
  }, [])

  const point = useCallback(
    (winner: Side, why: Why) => {
      const r = rally.current
      if (r.phase === 'point') return
      r.phase = 'point'
      const mine = winner === 0
      sound(mine ? 'find' : 'error')
      const n = Date.now()
      setBanner({ text: `${mine ? 'Your point' : 'Ops’ point'} · ${why === 'winner' ? (mine ? 'Ops missed it' : 'Winner') : mine ? `Ops: ${WHY_SAID[why].toLowerCase()}` : WHY_SAID[why]}`, mine, n })
      setPrompt('')
      session.move<Live>((cur) => awardPoint(cur, winner, why, st.target)).catch(() => {})
      setTimeout(() => {
        setBanner((b) => (b?.n === n ? null : b))
        if (rally.current.phase === 'point') nextServe()
      }, 1100)
    },
    [session, sound, st.target, nextServe],
  )

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
    if (live.result) {
      rally.current.phase = 'idle'
      setPrompt(live.result.final ? '' : `${live.result.winner === 0 ? 'You take' : 'Ops takes'} game ${live.game}`)
    }
  }, [live.result, live.game])

  /* ── your bat: moved like a trackpad, it hits whatever it meets ── */
  /** the thumb's (or mouse's) recent path, in screen px and event times */
  const path = useRef<{ x: number; y: number; t: number }[]>([])
  const touching = useRef(false)
  const track = (e: ReactPointerEvent) => {
    path.current.push({ x: e.clientX, y: e.clientY, t: e.timeStamp })
    if (path.current.length > 60) path.current.splice(0, 30)
  }
  /** the path over the last `ms` up to `now` (nothing if the thumb has been still) */
  const recent = (ms: number, now = performance.now()) => path.current.filter((p) => now - p.t <= ms)
  const keepBat = () => {
    const r = rally.current
    r.myX = Math.max(-BAT_X, Math.min(BAT_X, r.myX))
    r.myY = Math.max(BAT_Y.min, Math.min(r.phase === 'serve-me' ? SERVE_Y : BAT_Y.max, r.myY))
  }

  /** the bat meets the ball `b` of flight `f`: how the thumb was moving right then makes the shot */
  const meet = useCallback(
    (f: Flight, b: { x: number; y: number; z: number }, now: number) => {
      const r = rally.current
      const off = b.x - r.myX
      const v = (f.bounce.y - b.y) / Math.max(0.01, f.bounce.y - f.to.y)
      const c = contact(v)
      const shot = readStroke(recent(140, now), c.err, off)
      // a hard push into a ball sitting up high: a smash, flat out and easier to place
      const smash = b.z >= SMASH_Z && shot.power >= SMASH_PUSH
      shot.power = smash ? 1 : c.power(shot.power)
      if (smash) Object.assign(shot, { smash, err: shot.err * 0.5, top: Math.max(shot.top, 0.4) })
      // off the middle of the bat it goes astray
      shot.err = Math.max(shot.err, batErr(off) * 0.85)
      setHint(false)
      r.flight = plan(0, b.x, shot, r.clock, Math.random, b.y)
      r.swingAt = r.clock
      r.big = smash
      if (smash) smashed(true)
      else sound('pong')
    },
    [sound, smashed],
  )

  const down = (e: ReactPointerEvent) => {
    if (!inMatch) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    touching.current = true
    path.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }]
    if (e.pointerType === 'mouse') aimMouse(e)
  }
  /** a mouse just points: the bat goes to the spot under it */
  const aimMouse = (e: ReactPointerEvent) => {
    const box = tableEl.current?.getBoundingClientRect()
    if (!box?.width) return
    const px = ((e.clientX - box.left) / box.width) * VW
    const py = ((e.clientY - box.top) / box.height) * VH
    const r = rally.current
    r.myY = (NEAR_Y - py) / (NEAR_Y - FAR_Y)
    r.myX = (px - VW / 2) / (NEAR_HALF + (FAR_HALF - NEAR_HALF) * r.myY)
    keepBat()
  }
  const moveP = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') {
      track(e)
      aimMouse(e)
    } else {
      if (!touching.current) return
      // a thumb moves the bat by however far it moves (a little further), like a trackpad
      const last = path.current[path.current.length - 1]
      track(e)
      const box = tableEl.current?.getBoundingClientRect()
      if (!last || !box?.width) return
      const k = (VW / box.width) * GAIN
      const r = rally.current
      r.myX += ((e.clientX - last.x) * k) / NEAR_HALF
      r.myY -= ((e.clientY - last.y) * k) / (NEAR_Y - FAR_Y)
      keepBat()
    }
    // serving: a quick flick up sends it, without lifting the thumb
    if (rally.current.phase !== 'serve-me' || !touching.current) return
    const stroke = recent(180, e.timeStamp)
    const first = stroke[0]
    if (!first || first.y - e.clientY < 38 || (first.y - e.clientY) / Math.max(16, e.timeStamp - first.t) < 0.45) return
    serve(stroke)
  }
  const up = (e: ReactPointerEvent) => {
    if (!touching.current) return
    touching.current = false
    track(e)
    // a serve finished by lifting the thumb still counts
    if (rally.current.phase === 'serve-me') serve(recent(280, e.timeStamp))
    if (e.pointerType !== 'mouse') path.current = []
  }
  const serve = (stroke: { x: number; y: number; t: number }[]) => {
    const r = rally.current
    const shot = readSwipe({ points: stroke }, 0.08)
    if (!shot || r.phase !== 'serve-me') return
    setHint(false)
    r.flight = plan(0, r.myX, shot, r.clock, Math.random, r.myY)
    r.swingAt = r.clock
    r.big = false
    r.phase = 'flight'
    sound('pong')
    setPrompt('')
  }

  /* ── the loop ── */
  useEffect(() => {
    if (showResults) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const r = rally.current
      // a hidden tab pauses the clock instead of letting the ball fly past
      const dt = Math.min(now - last, 50)
      r.clock += dt
      last = now
      const t = r.clock
      const f = r.flight

      if (r.phase === 'serve-ops' && t >= r.serveAt) {
        r.flight = plan(1, r.opsX, opsServe(level), t)
        r.opsSwingAt = t
        r.phase = 'flight'
        sound('pong')
        setPrompt('')
      }
      if (r.phase === 'flight' && f) {
        const b = ballAt(f, t)
        if (f.fault && t >= f.tb + (f.fault === 'net' ? 320 : 180)) point((1 - f.by) as Side, f.fault)
        else if (!f.fault && f.by === 0 && r.late === f) {
          // she lunged and missed: let it fly past her before the point goes to you
          if (b.y > 1.16) point(0, 'winner')
        } else if (!f.fault && f.by === 0 && t >= f.t1 - 20) {
          // Ops meets it, or doesn't quite
          const res = opsReturn(level, f)
          if (res === 'late') {
            r.late = f
            // a lunge that comes up short of the ball, and a swing a beat too late
            r.lunge = b.x + (b.x > r.opsX ? -0.38 : 0.38)
            r.opsSwingAt = t + 110
          } else {
            r.flight = plan(1, b.x, res, t)
            r.opsSwingAt = t
            if (res.smash) smashed(false)
            else sound('pong')
          }
        } else if (!f.fault && f.by === 1 && t > f.tb) {
          // your bat meets it when the ball reaches its line (or the bat pushes through the ball)
          const d = b.y - r.myY
          const was = r.rel?.f === f ? r.rel.d : d
          r.rel = { f, d }
          if (((was > 0 && d <= 0) || Math.abs(d) < 0.025) && Math.abs(b.x - r.myX) <= BAT_REACH) meet(f, b, now)
          else if (b.y < GONE_Y) point(1, 'miss') // gone past you: let it fly by first
        }
        // the bounce, once per shot: a squash, a puff of chalk, the sound
        if (r.flight === f && f.fault !== 'net' && t >= f.tb && r.pinged !== f) {
          r.pinged = f
          r.bounceAt = t
          r.puff = { ...f.bounce }
          sound('ping')
        }
      }

      // where the ball is, and the rackets following it
      const fl = r.flight
      if (r.phase === 'serve-me') r.myY = Math.min(r.myY, SERVE_Y)
      const held = r.phase === 'serve-me' ? { x: r.myX, y: r.myY + 0.03, z: 0.35 } : r.phase === 'serve-ops' ? { x: r.opsX, y: HIT_Y[1] - 0.03, z: 0.35 } : null
      const ball = held ?? (fl ? ballAt(fl, t) : null)
      const comingToMe = fl?.by === 1 && r.phase === 'flight'
      const comingToOps = fl?.by === 0 && r.phase === 'flight'
      const target = (side: Side) => (fl && ((side === 0 && comingToMe) || (side === 1 && comingToOps)) ? fl.to.x * 0.85 + fl.bounce.x * 0.15 : 0)
      const follow = (cur: number, to: number, rate: number) => cur + (to - cur) * Math.min(1, rate)
      const opsSpeed = level === 'hard' ? 0.14 : level === 'medium' ? 0.1 : 0.07
      if (r.late && r.late === fl) r.opsX = follow(r.opsX, r.lunge, 0.22) // the lunge
      else if (r.phase !== 'serve-ops') r.opsX = follow(r.opsX, comingToOps ? Math.max(-1.1, Math.min(1.1, target(1))) : 0, opsSpeed)

      // the spin on the ball: sidespin turns the seam, top/backspin tumbles it
      if (fl && r.phase === 'flight') {
        r.turn += dt * fl.curl * 1.1
        r.tumble += dt * fl.top * 0.03
      }
      // a high ball coming to you, up off the bounce: it glows and the status says so
      const sit = !!(fl && fl.by === 1 && r.phase === 'flight' && !fl.fault && t > fl.tb && ballAt(fl, t).z >= SMASH_Z)
      if (sit !== r.sitter) {
        r.sitter = sit
        faceEl.current?.setAttribute('fill', sit ? 'var(--hit)' : '#fbf7ee')
        if (sit || r.phase === 'flight') setPrompt(sit ? 'Smash it!' : '')
      }
      if (seamEl.current) seamEl.current.setAttribute('transform', `rotate(${r.turn}) scale(1 ${Math.cos(r.tumble).toFixed(3)})`)

      if (ball && ballEl.current && shadowEl.current) {
        const p = proj(ball.x, ball.y, ball.z)
        const g = proj(ball.x, ball.y, 0)
        // it squashes for a moment where it meets the table
        const sq = Math.max(0, 1 - (t - r.bounceAt) / 110)
        const size = p.s * (1 + ball.z * 0.45)
        ballEl.current.setAttribute('transform', `translate(${p.px} ${p.py}) scale(${size * (1 + 0.35 * sq)} ${size * (1 - 0.3 * sq)})`)
        ballEl.current.style.opacity = '1'
        // the streak behind it: tinted for topspin (orange) or backspin (blue) on a quick ball
        r.trail.push({ px: p.px, py: p.py, s: size })
        if (r.trail.length > 12) r.trail.shift()
        const quick = fl && r.phase === 'flight' && fl.t1 - fl.t0 < 1000
        const tint = fl?.smash ? 'var(--hit)' : fl && fl.top > 0.3 ? 'var(--lash)' : fl && fl.top < -0.3 ? 'var(--seven)' : '#fbf7ee'
        trailEls.current.forEach((el, i) => {
          const at = r.trail[r.trail.length - 1 - (i + 1) * 3]
          if (!el) return
          if (!quick || !at) {
            el.style.opacity = '0'
            return
          }
          el.setAttribute('cx', String(at.px))
          el.setAttribute('cy', String(at.py))
          el.setAttribute('r', String(6.5 * at.s * (1 - i * 0.15)))
          el.setAttribute('fill', tint)
          el.style.opacity = String(0.45 - i * 0.12)
        })
        shadowEl.current.setAttribute('cx', String(g.px))
        shadowEl.current.setAttribute('cy', String(g.py))
        shadowEl.current.setAttribute('rx', String(6 * g.s))
        shadowEl.current.setAttribute('ry', String(3 * g.s))
        shadowEl.current.style.opacity = String(Math.max(0.12, 0.45 - ball.z * 0.4))
      } else if (ballEl.current && shadowEl.current) {
        ballEl.current.style.opacity = '0'
        shadowEl.current.style.opacity = '0'
        r.trail = []
        trailEls.current.forEach((el) => el && (el.style.opacity = '0'))
      }
      // the puff of chalk where it bounced: a ring that spreads and fades
      if (puffEl.current) {
        const k = (t - r.bounceAt) / 380
        if (k >= 0 && k < 1) {
          const at = proj(r.puff.x, r.puff.y)
          puffEl.current.setAttribute('cx', String(at.px))
          puffEl.current.setAttribute('cy', String(at.py))
          puffEl.current.setAttribute('r', String((4 + 16 * k) * at.s))
          puffEl.current.style.opacity = String(0.85 * (1 - k))
        } else puffEl.current.style.opacity = '0'
      }
      // a faint ring where Ops' shot will land on your side, so you can get there in time
      if (guideEl.current) {
        const show = fl && fl.by === 1 && r.phase === 'flight' && fl.fault !== 'net' && t < fl.tb + 120
        if (show) {
          const at = proj(fl.bounce.x, fl.bounce.y)
          guideEl.current.setAttribute('cx', String(at.px))
          guideEl.current.setAttribute('cy', String(at.py))
          guideEl.current.style.opacity = String(t < fl.tb ? 0.55 : 0.55 * (1 - (t - fl.tb) / 120))
        } else guideEl.current.style.opacity = '0'
      }
      const swing = (since: number) => Math.max(0, 1 - (t - since) / 180)
      if (myPad.current) {
        const p = proj(r.myX, r.myY - 0.02)
        myPad.current.setAttribute('transform', `translate(${p.px} ${p.py + 6}) rotate(${(r.big ? -60 : -30) * swing(r.swingAt)}) scale(${(1.65 * p.s).toFixed(3)})`)
      }
      if (opsPad.current) {
        const p = proj(r.opsX, HIT_Y[1] + 0.02)
        opsPad.current.setAttribute('transform', `translate(${p.px} ${p.py - 10}) rotate(${180 + (fl?.smash && fl.by === 1 ? 60 : 30) * swing(r.opsSwingAt)}) scale(1)`)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [showResults, level, point, sound, meet, smashed])

  /* ── screens ── */

  const score = (s: Side) => live.points[s]
  const server = live.result ? null : serverOf(live)
  const card = (s: Side) => (
    <ScoreCard p={seats[s]} you={s === me.seat && !session.local} turn={server === s} value={score(s)} meta={`Games ${live.games[s]} · first to ${st.target}`} />
  )

  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  return (
    <main className="ppm screen-in">
      <div className="mt-hud">
        {card(0)}
        <div className="ppm-game">
          <span className="label">Game {live.game}</span>
          <span className="ppm-to">to {POINTS}</span>
        </div>
        {card(1)}
      </div>

      <p className={`ppm-status${prompt.startsWith('Your') || prompt.startsWith('Smash') ? ' ppm-status--you' : ''}${prompt ? '' : ' ppm-status--quiet'}`} role="status">
        {prompt || ' '}
      </p>

      <div className="ppm-stage" onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={() => (touching.current = false)}>
        <svg ref={tableEl} className="ppm-table" viewBox={`0 0 ${VW} ${VH}`} data-ult-board aria-label="The table">
          {/* the table, its shadow, the lines */}
          <polygon points={[corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)].join(' ')} transform="translate(7 7)" fill="var(--ink)" />
          <polygon className="ppm-top" points={[corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)].join(' ')} stroke="var(--ink)" strokeWidth="4" strokeLinejoin="round" />
          <polygon points={[corner(-0.97, 0.012), corner(0.97, 0.012), corner(0.97, 0.988), corner(-0.97, 0.988)].join(' ')} fill="none" stroke="#fbf7ee" strokeWidth="2.5" />
          <line x1={proj(0, 0.012).px} y1={proj(0, 0.012).py} x2={proj(0, 0.988).px} y2={proj(0, 0.988).py} stroke="#fbf7ee" strokeWidth="1.5" />
          {/* the net: posts, mesh and the white tape */}
          <g>
            <rect x={proj(-1.08, NET_Y).px} y={proj(0, NET_Y).py - 15} width={proj(1.08, NET_Y).px - proj(-1.08, NET_Y).px} height="15" fill="url(#ppm-mesh)" stroke="var(--ink)" strokeWidth="2" />
            <line x1={proj(-1.08, NET_Y).px} y1={proj(0, NET_Y).py - 15} x2={proj(1.08, NET_Y).px} y2={proj(0, NET_Y).py - 15} stroke="#fbf7ee" strokeWidth="3" />
            <rect x={proj(-1.08, NET_Y).px - 4} y={proj(0, NET_Y).py - 19} width="5" height="21" fill="var(--ink)" />
            <rect x={proj(1.08, NET_Y).px - 1} y={proj(0, NET_Y).py - 19} width="5" height="21" fill="var(--ink)" />
          </g>
          <defs>
            <pattern id="ppm-mesh" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="rgb(18 16 22 / .35)" />
              <path d="M0 0L4 4M4 0L0 4" stroke="rgb(251 247 238 / .5)" strokeWidth=".6" />
            </pattern>
          </defs>

          {/* Ops' racket at the far end, the ball and its shadow, yours at the near end */}
          <g ref={opsPad} className="ppm-pad ppm-pad--ops">
            <Racket colour="var(--seven)" />
          </g>
          <ellipse ref={guideEl} rx="14" ry="8" fill="none" stroke="#fbf7ee" strokeWidth="2" strokeDasharray="4 4" style={{ opacity: 0 }} />
          <circle ref={puffEl} r="4" fill="none" stroke="#fbf7ee" strokeWidth="2" style={{ opacity: 0 }} />
          <ellipse ref={shadowEl} rx="6" ry="3" fill="var(--ink)" opacity="0" />
          {[0, 1, 2].map((i) => (
            <circle key={i} ref={(el) => void (trailEls.current[i] = el)} r="5" style={{ opacity: 0 }} />
          ))}
          <g ref={ballEl} style={{ opacity: 0 }}>
            <circle ref={faceEl} r="7" fill="#fbf7ee" stroke="var(--ink)" strokeWidth="2.5" />
            {/* the seam: turns with sidespin, tumbles with top or backspin */}
            <g ref={seamEl}>
              <path d="M-4.5 -4.6Q-1 0 -4.5 4.6M4.5 -4.6Q1 0 4.5 4.6" fill="none" stroke="var(--lash)" strokeWidth="1.6" strokeLinecap="round" />
            </g>
            <circle cx="-2" cy="-2.6" r="1.5" fill="#fff" />
          </g>
          <g ref={myPad} className="ppm-pad">
            <Racket colour="var(--lash)" />
          </g>
        </svg>

        {banner && (
          <div key={banner.n} className={`ppm-banner${banner.mine ? ' ppm-banner--mine' : ''}`} aria-hidden="true">
            {banner.text}
          </div>
        )}
        {pow && (
          <div key={pow.n} className={`ppm-pow${pow.mine ? ' ppm-pow--mine' : ''}`} aria-hidden="true">
            Smash!
          </div>
        )}
        {hint && (
          <div className="ppm-hint" aria-hidden="true">
            <span className="ppm-hint__arrow" />
            <span>Thumb down low, slide to move your bat like a trackpad · meet the ball · push up to hit: faster is harder, angle aims, curve spins</span>
          </div>
        )}
      </div>
    </main>
  )
}

/** A racket from above: the blade and a short handle, the blade facing the table. */
function Racket({ colour }: { colour: string }) {
  return (
    <>
      <rect x="-3.5" y="10" width="7" height="16" rx="2" fill="#a0683a" stroke="var(--ink)" strokeWidth="2.5" />
      <ellipse rx="17" ry="14" fill={colour} stroke="var(--ink)" strokeWidth="3" />
      <ellipse rx="11" ry="8" cx="-2" cy="-2" fill="#fff" opacity=".18" />
    </>
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: PPState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const g = st.live.games
  const winner = (g[0] >= st.target ? 0 : 1) as Side
  const iWon = session.local || winner === me.seat
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
    session.start({ ...initialPPState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${g[0]} — ${g[1]}`
  const history = st.live.history ?? []
  const card: CardInput = {
    game: 'Table Tennis',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(g[k]), meta: 'games won' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: history.map((h, i) => ({ word: `Game ${i + 1}`, seat: h[0] > h[1] ? 0 : 1, note: `${h[0]}–${h[1]}` })) },
  }

  return (
    <main className="ppm ppm-results screen-in">
      {iWon && <Confetti />}
      <div className="ppm-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match} · {seriesLabel(st.target).toLowerCase()}
        </p>
        <h1 className={`ppm-results__title${iWon ? ' ppm-results__title--win' : ''}`}>{iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'Ops'} wins`}</h1>
        <p className="ppm-results__line">
          {g[0]} <span>—</span> {g[1]}
        </p>
        {history.length > 0 && <p className="ppm-results__games">{history.map((h) => `${h[0]}–${h[1]}`).join(' · ')}</p>}
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={g[0]} meta="Games" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={g[1]} meta="Games" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Table Tennis', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={false}
        onReady={() => {
          sound('tap')
          session.ready(me.id)
        }}
        onLeave={exit.now}
      />
    </main>
  )
}
