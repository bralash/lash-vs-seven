import { ref as dbRef, set } from 'firebase/database'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { db } from '../../lib/firebase'
import { useServerOffset } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, roomPath, type Room } from '../../lobby/rooms'
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
import { pingMoments } from '../../match/moments'
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
  mirror,
  nextGame,
  opsReturn,
  opsServe,
  plan,
  pointKey,
  readStroke,
  readSwipe,
  rebase,
  serverOf,
  callOf,
  type Flight,
  type Live,
  type ShotMsg,
  type Side,
  type Why,
} from './engine'
import { pingpongFeats } from './feats'
import '../../styles/pingpong.css'

const GAME = 'pingpong'
/** "Single game" / "Best of 3" from the number of games needed */
export const seriesLabel = (target: number) => (target === 1 ? 'Single game' : `Best of ${target * 2 - 1}`)

export interface PPState {
  /** games needed to win the match */
  target: number
  match: number
  live: Live & { shot?: ShotMsg }
  ready?: Record<string, boolean>
}

export function initialPPState(target = 2, match = 1): PPState {
  return { target, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Side) }
}

/*
 * drawing: the table from a low camera just behind your end, in real perspective. The far end
 * shrinks to FAR_S of the near end and everything scales the same way, so your bat is big up close
 * (bigger than the thumb under it) and shrinks as you step in toward the net.
 */

const VW = 340
// room under your end of the table for your thumb, so the bat stays in sight above it
const VH = 575
const NEAR_Y = 340
const FAR_Y = 190
const NEAR_HALF = 160
/** how big the far end is next to the near end */
const FAR_S = 0.4
/** the camera's distance behind the near edge, in table lengths (from FAR_S) */
const CAM = FAR_S / (1 - FAR_S)
/** where the table's lines would meet, above the far end */
const HORIZON = (FAR_Y - FAR_S * NEAR_Y) / (1 - FAR_S)

/** your bat moves this much further than your thumb, so short movements cover your whole half */
const GAIN = 1.9
/** a thumb's movement in table lengths (fixed, so the trackpad feels the same wherever the bat is) */
const TRACK_LEN = 340

/** behind your end things grow at half the rate the perspective would give, so the bat stays on screen */
const BEHIND = 0.5
/** how big things are at depth y: perspective over the table, and growing steadily (not exploding) behind your end */
const scaleAt = (y: number) => (y >= 0 ? CAM / (y + CAM) : 1 - (BEHIND * y) / CAM)

/** table coordinates (x -1…1, y 0…1, z height) to the drawing */
function proj(x: number, y: number, z = 0) {
  const s = scaleAt(y)
  return { px: VW / 2 + x * NEAR_HALF * s, py: HORIZON + (NEAR_Y - HORIZON) * s - z * 70 * s, s }
}
/** the other way: a spot on the drawing to the table (at z 0) */
function unproj(px: number, py: number) {
  const s = Math.max(0.2, (py - HORIZON) / (NEAR_Y - HORIZON))
  return { x: (px - VW / 2) / (NEAR_HALF * s), y: s <= 1 ? CAM / s - CAM : ((1 - s) * CAM) / BEHIND }
}
/** the net's height, at its depth; the table top's thickness at your end */
const NET_H = Math.round(26 * scaleAt(0.5))
const EDGE = 12
/** where the hall's wall meets the floor, and how far below the table top the floor is (in ball heights) */
const SEAM = 160
const FLOOR_Z = -1.4
/** the ball and its marks shrink less than true size at the far end, so you can still see them there */
const seen = (s: number) => s ** 0.6
const corner = (x: number, y: number) => {
  const p = proj(x, y)
  return `${p.px},${p.py}`
}

const WHY_SAID: Record<Why, string> = { miss: 'Missed it', net: 'Into the net', long: 'Long', wide: 'Wide', winner: 'Winner' }

/** an apostrophe-s that reads right after any name: "Ops’ point", "Kofi’s point" */
const poss = (n: string) => (n.endsWith('s') ? `${n}’` : `${n}’s`)

type Phase = 'serve-me' | 'serve-them' | 'flight' | 'point' | 'idle'

/*
 * The rally is played in this phone's own view: you're side 0 at the near end, the other player
 * (Ops, or a friend on their phone) side 1 at the far end. The match state counts by seat, so seat 1
 * online sees everything turned round (`seatOf` swaps the two both ways).
 *
 * Online, each shot is one message: the hitter's phone plans the flight and sends it; the other
 * phone plays it on its own clock and is the only one to judge it (a return, a miss, a fault), so a
 * point is never argued over by two phones.
 */
export function PingPongMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as PPState
  const live = st.live
  const session = useSession(GAME, room.code)
  const vsOps = !!session.bot
  const online = !session.local && !vsOps
  const level = session.level ?? 'medium'
  const { play: sound } = useSound()
  const seats = playersBySeat(room)
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
    /** when the ball last met the table, and the puff of chalk where it landed */
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
    /** online: the other phone's latest shot, waiting to be played here */
    inbox: null as ShotMsg | null,
    /** where the ball was last drawn, so a shot arriving online starts from there */
    shown: null as { x: number; y: number } | null,
    /** how near the net the far racket is (a friend online can step in) */
    oppY: HIT_Y[1],
    /** shots played this point, serve included (both phones count every shot, so they agree) */
    hits: 0,
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
    r.oppY = HIT_Y[1]
    r.hits = 0
    if (seatOf(serverOf(l)) === 0) {
      r.phase = 'serve-me'
      setPrompt('Your serve · flick up')
    } else {
      // Ops serves after a moment; a friend's serve arrives as a message
      r.phase = 'serve-them'
      r.serveAt = r.clock + 900
      setPrompt(`${oppName} to serve`)
    }
  }, [seatOf, oppName])

  /** this phone judged the point (side 0 is you): it goes in, and both phones show it when it lands */
  const point = useCallback(
    (winner: Side, why: Why) => {
      const r = rally.current
      if (r.phase === 'point') return
      r.phase = 'point'
      setPrompt('')
      const key = pointKey(liveRef.current)
      const hits = r.hits
      session.move<Live>((cur) => (pointKey(cur) === key ? awardPoint(cur, seatOf(winner), why, st.target, hits) : undefined)).catch(() => {})
    },
    [session, st.target, seatOf],
  )

  // a point landed (judged here or on the other phone): the banner, then the next serve
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
    sound(mine ? 'find' : 'error')
    const n = Date.now()
    const text = mine
      ? `Your point · ${why === 'winner' || why === 'miss' ? `${oppName} missed it` : `${oppName}: ${WHY_SAID[why].toLowerCase()}`}`
      : `${poss(oppName)} point · ${why === 'winner' ? 'Winner' : WHY_SAID[why]}`
    setBanner({ text, mine, n })
    setPrompt('')
    // (not cleared when the room changes again: the other phone's serve can land within the second)
    setTimeout(() => {
      setBanner((b) => (b?.n === n ? null : b))
      if (rally.current.phase === 'point') nextServe()
    }, 1100)
  }, [live, seatOf, oppName, sound, nextServe])

  // online: the other phone's shot comes in, to be played on the next frame
  const shotSeen = useRef(live.shot?.id)
  useEffect(() => {
    const s = live.shot
    if (!online || !s || s.id === shotSeen.current) return
    shotSeen.current = s.id
    if (s.by !== me.seat) rally.current.inbox = s
  }, [online, live.shot, me.seat])

  /** online: your shot goes to the other phone, seen from its end, its times counted from the hit */
  const send = useCallback(
    (f: Flight) => {
      if (!online) return
      const w = flip ? mirror(f) : f
      const rel: Flight = { ...w, t0: 0, tb: w.tb - w.t0, t1: w.t1 - w.t0 }
      // the database won't take an undefined
      const clean = JSON.parse(JSON.stringify(rel)) as Flight
      const msg: ShotMsg = { id: Math.random().toString(36).slice(2, 10), by: me.seat as Side, at: Date.now() + offsetRef.current, pt: pointKey(liveRef.current), f: clean }
      shotSeen.current = msg.id
      set(dbRef(db, `${roomPath(GAME, room.code)}/state/live/shot`), msg).catch(() => {})
    },
    [online, flip, me.seat, room.code],
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
      // "Game", with the score: winning raw (they never got a point) is worth saying
      const w = live.result.winner
      const [hi, lo] = [live.points[w], live.points[(1 - w) as Side]]
      const who = seatOf(w) === 0 ? 'You take it' : `${oppName} takes it`
      setPrompt(live.result.final ? '' : `Game · ${who} ${hi}–${lo}${lo === 0 ? ' raw' : ''}`)
    }
  }, [live.result, live.game, live.points, seatOf, oppName])

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
      r.hits++
      send(r.flight)
      r.swingAt = r.clock
      r.big = smash
      if (smash) smashed(true)
      else sound('pong')
    },
    [sound, smashed, send],
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
    const at = unproj(px, py)
    r.myX = at.x
    r.myY = at.y
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
      r.myY -= ((e.clientY - last.y) * k) / TRACK_LEN
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
    r.hits++
    send(r.flight)
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

      if (vsOps && r.phase === 'serve-them' && t >= r.serveAt) {
        r.flight = plan(1, r.opsX, opsServe(level), t)
        r.hits++
        r.opsSwingAt = t
        r.phase = 'flight'
        sound('pong')
        setPrompt('')
      }
      // online: the other phone's shot (or serve) for this point starts flying here, from where the ball is showing
      const msg = r.inbox
      if (msg && msg.pt === pointKey(liveRef.current) && (r.phase === 'serve-them' || (r.phase === 'flight' && f?.by === 0))) {
        r.inbox = null
        const mine = flip ? mirror(msg.f) : msg.f
        const late = Math.max(0, Math.min(1500, Date.now() + offsetRef.current - msg.at))
        r.flight = rebase(mine, t, late, r.shown ?? mine.from)
        r.hits++
        // their racket is where they met it
        r.opsX = mine.from.x
        r.oppY = Math.max(0.6, mine.from.y)
        r.opsSwingAt = t
        r.phase = 'flight'
        if (mine.smash) smashed(false)
        else sound('pong')
        setPrompt('')
      }
      const g = r.flight
      if (r.phase === 'flight' && g) {
        const f = g
        const b = ballAt(f, t)
        // only the phone the ball is heading to calls a fault (online the hitter waits to hear)
        if (f.fault && (vsOps || f.by === 1) && t >= f.tb + (f.fault === 'net' ? 320 : 180)) point((1 - f.by) as Side, f.fault)
        else if (!vsOps && f.by === 0) {
          // online: your shot is on its way; their phone answers it
        } else if (!f.fault && f.by === 0 && r.late === f) {
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
            r.hits++
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
        // the bounce, once per shot: a puff of chalk, the sound
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
      const held = r.phase === 'serve-me' ? { x: r.myX, y: r.myY + 0.03, z: 0.35 } : r.phase === 'serve-them' ? { x: r.opsX, y: r.oppY - 0.03, z: 0.35 } : null
      const ball = held ?? (fl ? ballAt(fl, t) : null)
      r.shown = ball ? { x: ball.x, y: ball.y } : null
      const comingToMe = fl?.by === 1 && r.phase === 'flight'
      const comingToOps = fl?.by === 0 && r.phase === 'flight'
      const target = (side: Side) => (fl && ((side === 0 && comingToMe) || (side === 1 && comingToOps)) ? fl.to.x * 0.85 + fl.bounce.x * 0.15 : 0)
      const follow = (cur: number, to: number, rate: number) => cur + (to - cur) * Math.min(1, rate)
      const opsSpeed = !vsOps ? 0.12 : level === 'hard' ? 0.14 : level === 'medium' ? 0.1 : 0.07
      if (r.late && r.late === fl) r.opsX = follow(r.opsX, r.lunge, 0.22) // the lunge
      else if (r.phase !== 'serve-them') r.opsX = follow(r.opsX, comingToOps ? Math.max(-1.1, Math.min(1.1, target(1))) : 0, opsSpeed)

      // the spin on the ball: sidespin turns the seam, top/backspin tumbles it
      if (fl && r.phase === 'flight') {
        r.turn += dt * fl.curl * 1.1
        r.tumble += dt * fl.top * 0.03
      }
      // a high ball coming to you, up off the bounce: it glows and the status says so
      const sit = !!(fl && fl.by === 1 && r.phase === 'flight' && !fl.fault && t > fl.tb && ballAt(fl, t).z >= SMASH_Z)
      if (sit !== r.sitter) {
        r.sitter = sit
        // a hard plastic ball never changes shape: a sitter just burns white-hot and glows
        faceEl.current?.setAttribute('fill', sit ? 'url(#ppm-ball-hot)' : BALL)
        if (sit) ballEl.current?.setAttribute('filter', 'url(#ppm-glow)')
        else ballEl.current?.removeAttribute('filter')
        if (sit || r.phase === 'flight') setPrompt(sit ? 'Smash it!' : '')
      }
      if (seamEl.current) seamEl.current.setAttribute('transform', `rotate(${r.turn}) scale(1 ${Math.cos(r.tumble).toFixed(3)})`)

      if (ball && ballEl.current && shadowEl.current) {
        const p = proj(ball.x, ball.y, ball.z)
        const g = proj(ball.x, ball.y, 0)
        // always round: only its distance (and a little its height) changes how big it looks
        const size = seen(p.s) * (1 + ball.z * 0.45)
        ballEl.current.setAttribute('transform', `translate(${p.px} ${p.py}) scale(${size})`)
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
        shadowEl.current.setAttribute('rx', String(6 * seen(g.s)))
        shadowEl.current.setAttribute('ry', String(3 * seen(g.s)))
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
          puffEl.current.setAttribute('r', String((4 + 16 * k) * seen(at.s)))
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
        // reaching wide, the bat stays on screen (its reach is still measured on the table)
        p.px = Math.max(26, Math.min(VW - 26, p.px))
        // out to the side it leans like a backhand (left) or a forehand (right); upright in the middle
        const tilt = Math.max(-1.2, Math.min(1.2, r.myX)) * 28
        myPad.current.setAttribute('transform', `translate(${p.px} ${p.py + 6}) rotate(${tilt + (r.big ? -60 : -30) * swing(r.swingAt)}) scale(${(1.65 * p.s).toFixed(3)})`)
      }
      if (opsPad.current) {
        const p = proj(r.opsX, r.oppY + 0.02)
        const tilt = Math.max(-1.2, Math.min(1.2, r.opsX)) * 24
        opsPad.current.setAttribute('transform', `translate(${p.px} ${p.py - 10 * p.s}) rotate(${180 - tilt + (fl?.smash && fl.by === 1 ? 60 : 30) * swing(r.opsSwingAt)}) scale(${(1.9 * p.s).toFixed(3)})`)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [showResults, level, point, sound, meet, smashed, vsOps, flip])

  /* ── screens ── */

  const score = (s: Side) => live.points[s]
  const server = live.result ? null : serverOf(live)
  const card = (s: Side) => (
    <ScoreCard p={seats[s]} you={s === me.seat && !session.local} turn={server === s} value={score(s)} meta={`Games ${live.games[s]} · first to ${st.target}`} />
  )

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

  return (
    <main className="ppm screen-in">
      <div className="mt-hud">
        {card(0)}
        <div className="ppm-game">
          <span className="label">Game {live.game}</span>
          <span className="ppm-to">{live.result ? 'Game' : (callOf(live.points) ?? `to ${POINTS}`)}</span>
        </div>
        {card(1)}
      </div>

      <p className={`ppm-status${prompt.startsWith('Your') || prompt.startsWith('Smash') ? ' ppm-status--you' : ''}${prompt ? '' : ' ppm-status--quiet'}`} role="status">
        {prompt || ' '}
      </p>

      <div className="ppm-stage" onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={() => (touching.current = false)}>
        <svg ref={tableEl} className="ppm-table" viewBox={`0 0 ${VW} ${VH}`} data-ult-board aria-label="The table">
          <SceneDefs />
          <Hall />
          <Table />

          {/* their racket at the far end, the ball and its shadow, yours at the near end (each in its seat's colour) */}
          <g ref={opsPad} className="ppm-pad ppm-pad--ops">
            <Racket colour={flip ? 'var(--lash)' : 'var(--seven)'} />
          </g>
          <ellipse ref={guideEl} rx="14" ry="8" fill="none" stroke="#fbf7ee" strokeWidth="2" strokeDasharray="4 4" style={{ opacity: 0 }} />
          <circle ref={puffEl} r="4" fill="none" stroke="#fbf7ee" strokeWidth="2" style={{ opacity: 0 }} />
          <ellipse ref={shadowEl} rx="6" ry="3" fill="#000" filter="url(#ppm-soft)" opacity="0" />
          {[0, 1, 2].map((i) => (
            <circle key={i} ref={(el) => void (trailEls.current[i] = el)} r="5" style={{ opacity: 0 }} />
          ))}
          <g ref={ballEl} style={{ opacity: 0 }}>
            <circle ref={faceEl} r="7" fill={BALL} stroke="rgb(120 80 0 / .35)" strokeWidth=".8" />
            {/* the maker's print: turns with sidespin, tumbles with top or backspin */}
            <g ref={seamEl}>
              <path d="M-2.6 -1.2Q0 -2.8 2.6 -1.2M-1.6 0.6H1.6" fill="none" stroke="#7a5200" strokeWidth=".8" strokeLinecap="round" opacity=".45" />
            </g>
            <circle r="7" fill="url(#ppm-ball-shade)" />
          </g>
          <g ref={myPad} className="ppm-pad">
            <Racket colour={flip ? 'var(--seven)' : 'var(--lash)'} />
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
      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── the scene: a sports hall, drawn to look real (the HUD around it keeps the app's look) ── */

const BALL = 'url(#ppm-ball)'

/** gradients, textures and the soft blur the scene shares */
function SceneDefs() {
  return (
    <defs>
      <linearGradient id="ppm-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5a3d26" />
        <stop offset=".55" stopColor="#b98250" />
        <stop offset="1" stopColor="#d9a46c" />
      </linearGradient>
      <pattern id="ppm-planks" width="9" height="40" patternUnits="userSpaceOnUse">
        <rect width="9" height="40" fill="transparent" />
        <rect width="1" height="40" fill="rgb(60 34 16 / .35)" />
        <rect x="1" width="1" height="40" fill="rgb(255 225 180 / .12)" />
      </pattern>
      <linearGradient id="ppm-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c48a55" />
        <stop offset=".35" stopColor="#d9a26a" />
        <stop offset="1" stopColor="#8a5a33" />
      </linearGradient>
      <radialGradient id="ppm-vignette" cx=".5" cy=".45" r=".75">
        <stop offset=".55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".55" />
      </radialGradient>
      <radialGradient id="ppm-under" cx=".5" cy=".35" r=".6">
        <stop offset="0" stopColor="#0d0907" stopOpacity=".95" />
        <stop offset=".7" stopColor="#1c120b" stopOpacity=".8" />
        <stop offset="1" stopColor="#1c120b" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ppm-top" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#1f9a59" />
        <stop offset=".6" stopColor="#1a8a4f" />
        <stop offset="1" stopColor="#157443" />
      </linearGradient>
      <radialGradient id="ppm-sheen" cx=".3" cy=".7" r=".5">
        <stop offset="0" stopColor="#fff" stopOpacity=".16" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ppm-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e9e6e0" />
        <stop offset=".35" stopColor="#a9a59d" />
        <stop offset="1" stopColor="#5e5a54" />
      </linearGradient>
      <pattern id="ppm-mesh" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="rgb(20 16 12 / .45)" />
        <path d="M0 0L3 3M3 0L0 3" stroke="rgb(255 255 255 / .35)" strokeWidth=".45" />
      </pattern>
      <radialGradient id="ppm-ball" cx=".38" cy=".32" r=".75">
        <stop offset="0" stopColor="#fff7c4" />
        <stop offset=".45" stopColor="#ffd62e" />
        <stop offset="1" stopColor="#d99a00" />
      </radialGradient>
      <radialGradient id="ppm-ball-hot" cx=".38" cy=".32" r=".75">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".5" stopColor="#fff3a0" />
        <stop offset="1" stopColor="#ffb800" />
      </radialGradient>
      <filter id="ppm-glow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="2.4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient id="ppm-ball-shade" cx=".35" cy=".3" r=".7">
        <stop offset="0" stopColor="#fff" stopOpacity=".7" />
        <stop offset=".25" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".18" />
      </radialGradient>
      {/* the rubber: light from the top left, darker to the rim, and its fine grain */}
      <radialGradient id="ppm-rubber" cx=".36" cy=".3" r=".8">
        <stop offset="0" stopColor="#fff" stopOpacity=".32" />
        <stop offset=".35" stopColor="#fff" stopOpacity=".04" />
        <stop offset=".8" stopColor="#000" stopOpacity=".12" />
        <stop offset="1" stopColor="#000" stopOpacity=".32" />
      </radialGradient>
      <pattern id="ppm-grain" width="2.2" height="2.2" patternUnits="userSpaceOnUse">
        <circle cx="1.1" cy="1.1" r=".45" fill="#000" opacity=".13" />
      </pattern>
      <linearGradient id="ppm-wood" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#a86a36" />
        <stop offset=".45" stopColor="#f0c48a" />
        <stop offset="1" stopColor="#b97a42" />
      </linearGradient>
      <filter id="ppm-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id="ppm-softer" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
  )
}

/** the wall (wooden slats, a skirting board) and the floor (boards running away from you) */
function Hall() {
  const vp = { x: VW / 2, y: HORIZON }
  // floor boards: lines from the vanishing point, drawn from the skirting down
  const boards = Array.from({ length: 25 }, (_, i) => {
    const bx = VW / 2 + (i - 12) * 46
    const k = (SEAM + 6 - vp.y) / (VH - vp.y)
    return { x1: vp.x + (bx - vp.x) * k, x2: bx }
  })
  return (
    <g aria-hidden="true">
      <rect width={VW} height={SEAM} fill="url(#ppm-wall)" />
      <rect width={VW} height={SEAM} fill="url(#ppm-planks)" />
      <rect y={SEAM - 52} width={VW} height="3" fill="rgb(40 22 10 / .35)" />
      <rect y={SEAM} width={VW} height={VH - SEAM} fill="url(#ppm-floor)" />
      {boards.map((b, i) => (
        <line key={i} x1={b.x1} y1={SEAM + 6} x2={b.x2} y2={VH} stroke="rgb(70 40 18 / .22)" strokeWidth="1" />
      ))}
      {/* the light off the varnish, and the skirting */}
      <ellipse cx={VW / 2} cy={SEAM + 40} rx={VW * 0.55} ry="26" fill="#fff3dd" opacity=".18" filter="url(#ppm-softer)" />
      <rect y={SEAM} width={VW} height="6" fill="#3a2414" />
      <rect y={SEAM + 6} width={VW} height="2" fill="rgb(0 0 0 / .25)" />
      <rect width={VW} height={VH} fill="url(#ppm-vignette)" />
    </g>
  )
}

const TOP = [corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)].join(' ')

/** the table: its shadow and legs on the floor, the slab, the green top with its lines, and the net */
function Table() {
  const floor = (x: number, y: number) => proj(x, y, FLOOR_Z)
  const leg = (x: number, y: number) => {
    const top = proj(x, y)
    const bot = floor(x, y)
    const w = 9 * top.s
    return <rect key={`${x}:${y}`} x={top.px - w / 2} y={top.py} width={w} height={bot.py - top.py} fill="#17120e" />
  }
  // the slab under the top: the same outline, dropped by the table's thickness
  const drop = (x: number, y: number) => {
    const p = proj(x, y)
    return `${p.px},${p.py + EDGE * p.s}`
  }
  const n0 = proj(-1, 0)
  const n1 = proj(1, 0)
  const net = proj(0, NET_Y)
  const nl = proj(-1.12, NET_Y).px
  const nr = proj(1.12, NET_Y).px
  return (
    <g aria-hidden="true">
      {/* the dark under the table, spread on the floor */}
      <polygon points={[floor(-1.15, -0.05), floor(1.15, -0.05), floor(1.15, 1.05), floor(-1.15, 1.05)].map((p) => `${p.px},${p.py}`).join(' ')} fill="#120c08" opacity=".78" filter="url(#ppm-softer)" />
      {leg(-0.86, 0.94)}
      {leg(0.86, 0.94)}
      {leg(-0.86, 0.08)}
      {leg(0.86, 0.08)}
      <polygon points={[drop(-1, 0), drop(1, 0), drop(1, 1), drop(-1, 1)].join(' ')} fill="#3d3a36" />
      {/* the front edge you're looking at: a white lip, then the metal-grey side */}
      <polygon points={`${n0.px},${n0.py} ${n1.px},${n1.py} ${n1.px},${n1.py + EDGE} ${n0.px},${n0.py + EDGE}`} fill="url(#ppm-edge)" />
      <polygon points={TOP} fill="url(#ppm-top)" />
      <polygon points={TOP} fill="url(#ppm-sheen)" />
      <polygon points={[corner(-0.985, 0.006), corner(0.985, 0.006), corner(0.985, 0.994), corner(-0.985, 0.994)].join(' ')} fill="none" stroke="#f6f4ee" strokeWidth="2.6" strokeLinejoin="round" />
      <line x1={proj(0, 0.006).px} y1={proj(0, 0.006).py} x2={proj(0, 0.994).px} y2={proj(0, 0.994).py} stroke="#f6f4ee" strokeWidth="1.6" />
      {/* the net: the mesh, its shadow on the top, the white tape, the clamps */}
      <rect x={nl} y={net.py - 1} width={nr - nl} height="3" fill="#000" opacity=".25" filter="url(#ppm-soft)" />
      <rect x={nl} y={net.py - NET_H} width={nr - nl} height={NET_H} fill="url(#ppm-mesh)" />
      <rect x={nl} y={net.py - NET_H - 1.5} width={nr - nl} height="3" fill="#f6f4ee" />
      <rect x={nl - 3} y={net.py - NET_H - 3} width="4" height={NET_H + 6} fill="#2a2724" />
      <rect x={nr - 1} y={net.py - NET_H - 3} width="4" height={NET_H + 6} fill="#2a2724" />
    </g>
  )
}

/** A racket, face on: the blade's rubber (shaded, with its grain and a dark wooden rim) on a flared wooden handle. */
function Racket({ colour }: { colour: string }) {
  const blade = 'M0 -17C10 -17 17.5 -10 17.5 -1C17.5 8 11 14.5 4 15.5L-4 15.5C-11 14.5 -17.5 8 -17.5 -1C-17.5 -10 -10 -17 0 -17Z'
  return (
    <>
      <path d="M-3.6 13L3.6 13L4.6 31Q4.8 34 0 34Q-4.8 34 -4.6 31Z" fill="url(#ppm-wood)" stroke="rgb(60 30 10 / .55)" strokeWidth=".8" />
      <path d="M-1 16V32M1.4 17V31" stroke="rgb(90 50 20 / .25)" strokeWidth=".5" />
      <path d={blade} fill="#2b1a0f" transform="scale(1.06)" />
      <path d={blade} fill={colour} />
      <path d={blade} fill="url(#ppm-grain)" />
      <path d={blade} fill="url(#ppm-rubber)" />
      <path d="M-3.4 12.5L3.4 12.5L2.6 16L-2.6 16Z" fill="#2b1a0f" />
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
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, pingpongFeats(st.live), pingMoments(st.live))
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
