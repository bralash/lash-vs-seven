import { ref as dbRef, set } from 'firebase/database'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { FIRST_MS, MAX_MS, PR, RESPAWN_MS, SCENES, decide, fresh, freshLive, jump, opsTaps, progress, sawAt, sceneOf, settle, starCount, step, tapsOf, type DashLive, type Run, type Seat } from './engine'
import { dashFeats } from './feats'
import '../../styles/dash.css'

const GAME = 'dash'

/** online, the other run is judged this far behind (ms), so a tap still on its way isn't taken for a fall */
const GRACE = 1800
/** and shown this far behind */
const SHOWN_LAG = 300
const STEP_MS = 1000 / 240

export interface DashState {
  /** races to win the match */
  need: number
  match: number
  live: DashLive
  ready?: Record<string, boolean>
}

export function initialDashState(need = 2, match = 1): DashState {
  return { need, match, live: freshLive() }
}

/**
 * A run kept up to date as time goes on, instead of replayed from the start every frame. Taps only
 * ever come in for moments it hasn't reached; if one doesn't (a very late one from the other phone),
 * it starts again from the beginning, so it always matches a full replay.
 */
class LiveRun {
  run: Run
  private i = 0
  private k = 0
  private taps: number[] = []
  constructor(private scene: number) {
    this.run = fresh(SCENES[scene])
  }
  at(taps: number[], until: number): Run {
    // a tap for a moment already played: start again
    const known = this.taps
    let same = known.length <= taps.length
    for (let j = 0; same && j < known.length; j++) same = known[j] === taps[j]
    if (!same || (taps.length > this.k && taps[this.k] <= this.i * STEP_MS)) {
      this.run = fresh(SCENES[this.scene])
      this.i = 0
      this.k = 0
    }
    this.taps = taps.slice()
    const s = SCENES[this.scene]
    const end = Math.min(until, MAX_MS)
    while ((this.i + 1) * STEP_MS <= end && this.run.finish === null) {
      this.i++
      const t = this.i / 240
      while (this.k < taps.length && taps[this.k] <= t * 1000) jump(this.run), this.k++
      step(s, this.run, 1 / 240, t)
    }
    return this.run
  }
  /** how far into the run it's been played (ms) */
  get t() {
    return this.i * STEP_MS
  }
}

/* ── drawing: the scene, the other runner as a ghost, you ── */

const VIEW_W = 360
const VIEW_H = 300

function draw(ctx: CanvasRenderingContext2D, px: number, scene: number, me: Run, ghost: Run | null, t: number, seat: Seat) {
  const s = SCENES[scene]
  const th = s.theme
  const scale = px / VIEW_W
  const camX = Math.max(0, Math.min(me.x - VIEW_W * 0.3, s.flag + 120 - VIEW_W))
  const camY = 50
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale)
  ctx.fillStyle = th.bg
  ctx.fillRect(camX, camY, VIEW_W, VIEW_H)
  ctx.fillStyle = th.grain
  for (let x = Math.floor(camX / 14) * 14; x < camX + VIEW_W; x += 14) for (let y = Math.floor(camY / 14) * 14; y < camY + VIEW_H; y += 14) ctx.fillRect(x, y, 1.4, 1.4)

  ctx.strokeStyle = th.ink
  ctx.lineCap = 'round'
  ctx.lineWidth = 5
  for (const p of s.plats) {
    if (p.x2 < camX - 10 || p.x1 > camX + VIEW_W + 10) continue
    ctx.beginPath()
    ctx.moveTo(p.x1, p.y)
    ctx.lineTo(p.x2, p.y)
    ctx.stroke()
  }
  // the posts: lit once you're past them
  ctx.lineWidth = 3
  s.checks.slice(1).forEach((c, k) => {
    const p = s.plats.find((q) => q.x1 <= c + 10 && q.x2 >= c + 10)
    if (!p) return
    ctx.strokeStyle = th.ink
    ctx.beginPath()
    ctx.moveTo(c + 10, p.y)
    ctx.lineTo(c + 10, p.y - 26)
    ctx.stroke()
    ctx.fillStyle = me.check > k ? th.accent : th.grain
    ctx.fillRect(c + 10, p.y - 26, 11, 8)
  })
  // the flag
  const fp = s.plats.find((q) => q.x1 <= s.flag && q.x2 >= s.flag)!
  ctx.lineWidth = 4
  ctx.strokeStyle = th.ink
  ctx.beginPath()
  ctx.moveTo(s.flag, fp.y)
  ctx.lineTo(s.flag, fp.y - 64)
  ctx.stroke()
  ctx.fillStyle = th.accent
  ctx.beginPath()
  const wave = Math.sin(t * 6) * 3
  ctx.moveTo(s.flag, fp.y - 64)
  ctx.lineTo(s.flag + 36, fp.y - 54 + wave)
  ctx.lineTo(s.flag, fp.y - 42)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // portals: rings
  s.portals.forEach((q, k) => {
    for (const [p, j] of [[q.a, 0], [q.b, 1]] as const)
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i % 2 ? th.ink : th.accent
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(p.x, p.y, 20 - i * 6 + Math.sin(t * 4 + i + j + k) * 1.5, 0, Math.PI * 2)
        ctx.stroke()
      }
  })
  // stars you haven't taken
  s.stars.forEach((st, i) => {
    if (me.stars & (1 << i)) return
    ctx.save()
    ctx.translate(st.x, st.y + Math.sin(t * 3 + i) * 3)
    ctx.rotate(Math.sin(t * 2 + i) * 0.2)
    ctx.fillStyle = th.accent
    ctx.strokeStyle = th.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 ? 4.5 : 11
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
  // saws: toothed, spinning
  for (const sw of s.saws) {
    const q = sawAt(sw, t)
    if (q.x < camX - 30 || q.x > camX + VIEW_W + 30) continue
    ctx.save()
    ctx.translate(q.x, q.y)
    ctx.rotate(t * 8)
    ctx.fillStyle = th.saw
    ctx.strokeStyle = th.ink
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const rr = i % 2 ? q.r : q.r * 0.78
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = th.bg
    ctx.beginPath()
    ctx.arc(0, 0, q.r * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  // the runners: theirs a ghost, then you
  const colour = (k: Seat) => (k === 0 ? '#ff5a1f' : '#2d5bff')
  const runner = (r: Run, c: string, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = th.ink
    for (let i = 0; i < r.trail.length; i += 2) {
      ctx.beginPath()
      ctx.arc(r.trail[i].x, r.trail[i].y, 1.6 + i * 0.12, 0, Math.PI * 2)
      ctx.fill()
    }
    if (r.down > 0 && r.downAt) {
      const p = 1 - r.down / RESPAWN_MS
      ctx.strokeStyle = c
      ctx.lineWidth = 3
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(r.downAt.x + Math.cos(a) * (6 + p * 12), r.downAt.y + Math.sin(a) * (6 + p * 12))
        ctx.lineTo(r.downAt.x + Math.cos(a) * (10 + p * 22), r.downAt.y + Math.sin(a) * (10 + p * 22))
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = c
      ctx.strokeStyle = th.ink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(r.x, r.y, PR, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      const look = r.vy > 200 ? 1.5 : r.vy < -200 ? -1.5 : 0
      for (const ex of [0, 5]) {
        ctx.beginPath()
        ctx.arc(r.x + ex, r.y - 2 + look, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }
  if (ghost) runner(ghost, colour((1 - seat) as Seat), 0.5)
  runner(me, colour(seat), 1)

  // the race along the top: both runners on a line to the flag
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = th.ink
  ctx.fillRect(16, 16, VIEW_W - 32, 5)
  ctx.fillStyle = th.accent
  ctx.fillRect(VIEW_W - 22, 9, 9, 8)
  const dots: [Run, Seat][] = ghost ? [[ghost, (1 - seat) as Seat], [me, seat]] : [[me, seat]]
  for (const [r, k] of dots) {
    const x = 16 + progress(scene, r) * (VIEW_W - 32)
    ctx.fillStyle = colour(k)
    ctx.strokeStyle = th.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, 18.5, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

/** the board: a canvas drawn every frame from the runs */
function Board({ scene, seat, frame }: { scene: number; seat: Seat; frame: (draw: (me: Run, ghost: Run | null, t: number) => void) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const w = c.clientWidth
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      const px = Math.round(w * dpr)
      if (c.width !== px) {
        c.width = px
        c.height = Math.round((px * VIEW_H) / VIEW_W)
      }
      frame((me, ghost, t) => draw(ctx, px, scene, me, ghost, t, seat))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [scene, seat, frame])
  return <canvas ref={canvas} className="dash-canvas" />
}

/* ── the match ── */

export function DashMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as DashState
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
  const scene = sceneOf(live)
  const theme = SCENES[scene].theme

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
  /** your taps this race (ms into the run), kept here as you make them */
  const myTaps = useRef<{ g: number; taps: number[] }>({ g: live.g, taps: [] })
  if (myTaps.current.g !== live.g) myTaps.current = { g: live.g, taps: [] }
  /** Ops' taps for this race, worked out when it starts */
  const ops = useMemo(() => (vsOps ? opsTaps(scene, level) : []), [vsOps, scene, level, live.g])
  /** the runs, kept up to date frame by frame: yours, theirs as judged, theirs as shown */
  const runs = useMemo(() => ({ me: new LiveRun(scene), them: new LiveRun(scene), shown: new LiveRun(scene) }), [scene, live.g])
  const [, setTick] = useState(0)
  const [banner, setBanner] = useState<{ text: string; mine: boolean; n: number } | null>(null)

  // the stage takes the scene's colour
  useEffect(() => {
    document.documentElement.style.setProperty('--dash-bg', theme.bg)
    document.documentElement.style.setProperty('--dash-ink', theme.ink)
  }, [theme])
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--dash-bg')
      document.documentElement.style.removeProperty('--dash-ink')
    },
    [],
  )

  // the first race: the host (or this phone, against Ops) sets it going
  useEffect(() => {
    if (live.start || over || !(me.isHost || vsOps)) return
    session.move<DashLive>((cur) => (cur.start || cur.result ? undefined : { ...cur, start: now() + FIRST_MS })).catch(() => {})
  }, [live.start, over, me.isHost, vsOps, session, now])

  // dev only: the race clock, for scripted test runs
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __dashT: () => number }).__dashT = () => (liveRef.current.start ? now() - liveRef.current.start : -Infinity)
  }, [now])

  /** both runs as far as this phone can trust them */
  const runsAt = useCallback(
    (t: number) => {
      const l = liveRef.current
      const theirTaps = vsOps ? ops : tapsOf(l, l.g, theirs)
      const me_ = runs.me.at(myTaps.current.taps, t)
      const them = runs.them.at(theirTaps, online ? t - GRACE : t)
      const shown = online ? runs.shown.at(theirTaps, t - SHOWN_LAG) : them
      return { me_, them, shown, tMe: t, tThem: online ? t - GRACE : t }
    },
    [vsOps, ops, theirs, online, runs],
  )

  /** a tap: jump */
  const tap = useCallback(() => {
    const l = liveRef.current
    if (l.result || !l.start) return
    const t = Math.round(now() - l.start)
    if (t < 0) return
    const mineRun = runs.me.at(myTaps.current.taps, t)
    if (mineRun.finish !== null || mineRun.down > 0) return
    // (a tap that can't jump, the third in the air, still counts in the replay as nothing)
    const list = myTaps.current.taps
    // never earlier than a moment already played (two taps in one frame)
    const at = Math.max(t, Math.ceil(runs.me.t) + 1, (list[list.length - 1] ?? -1) + 1)
    list.push(at)
    sound('tap')
    if (online) set(dbRef(db, `${roomPath(GAME, room.code)}/state/live/runs/g${l.g}/s${mine}/k${list.length - 1}`), at).catch(() => {})
  }, [now, online, room.code, mine, sound, runs])

  // keys on a computer: space, up or enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tap])

  // every frame: sounds, settling the race once it's decided, and the board
  const sent = useRef(0)
  const heard = useRef<{ g: number; restarts: number; stars: number; flag: boolean }>({ g: 0, restarts: 0, stars: 0, flag: false })
  const frame = useCallback(
    (paint: (me: Run, ghost: Run | null, t: number) => void) => {
      const l = liveRef.current
      const t = l.start ? Math.max(0, now() - l.start) : 0
      const { me_, them, shown, tMe, tThem } = runsAt(l.start && !l.result ? t : 0)
      paint(me_, shown, t / 1000)
      if (!l.start || l.result || now() < l.start) return
      if (heard.current.g !== l.g) heard.current = { g: l.g, restarts: 0, stars: 0, flag: false }
      if (me_.restarts > heard.current.restarts) {
        heard.current.restarts = me_.restarts
        sound('boom')
        navigator.vibrate?.(60)
      }
      if (starCount(me_) > heard.current.stars) {
        heard.current.stars = starCount(me_)
        sound('ping')
      }
      if (me_.finish !== null && !heard.current.flag) {
        heard.current.flag = true
        sound('find')
      }
      const pair: [Run, Run] = mine === 0 ? [me_, them] : [them, me_]
      const times: [number, number] = mine === 0 ? [tMe, tThem] : [tThem, tMe]
      const w = decide(pair[0], pair[1], times[0], times[1])
      if (w !== null && sent.current !== l.g) {
        sent.current = l.g
        const g = l.g
        session.move<DashLive>((cur) => settle(cur, g, w, pair, st.need, now())).catch(() => {})
      }
    },
    [now, runsAt, mine, session, st.need, sound],
  )

  // the words above the board keep up a few times a second; the board draws every frame
  useEffect(() => {
    if (showResults) return
    const id = setInterval(() => setTick((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [showResults])

  // a race settled: the banner
  const seen = useRef(live.last?.g ?? 0)
  useEffect(() => {
    const last = live.last
    if (!last || last.g === seen.current) return
    seen.current = last.g
    const iWon = last.winner === mine
    const time = (s: Seat) => ((last.times?.[s] ?? -1) >= 0 ? `${(last.times[s] / 1000).toFixed(1)}s` : 'furthest')
    if (!live.result) sound(last.winner === -1 ? 'tick' : iWon ? 'findBig' : 'error')
    const text = last.winner === -1 ? 'Dead heat · again' : iWon ? `You take it · ${time(mine)}` : `${oppName} takes it · ${time(theirs)}`
    const n = Date.now()
    setBanner({ text, mine: iWon, n })
    setTimeout(() => setBanner((x) => (x?.n === n ? null : x)), 2800)
  }, [live.last, live.result, mine, theirs, oppName, sound])

  /* ── screens ── */

  const card = (s: Seat) => <ScoreCard p={seats[s]} you={s === mine} value={live.wins[s]} meta={st.need > 1 ? `Races · first to ${st.need}` : 'One race'} />
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

  const t = live.start ? now() - live.start : -FIRST_MS
  const { me_, shown } = runsAt(Math.max(0, Math.round(t)))
  // (one short line, always: a status that wrapped onto two would nudge the board)
  let status: string
  if (over) status = ''
  else if (!live.start || t < 0) status = `${st.need > 1 ? `Race ${live.g} · ` : ''}${SCENES[scene].name} · ${t < 0 ? Math.ceil(-t / 1000) : '…'}`
  else if (me_.finish !== null && shown.finish === null) status = `At the flag · ${(me_.finish / 1000).toFixed(1)}s`
  else if (shown.finish !== null && me_.finish === null) status = `${oppName}’s at the flag · go!`
  else if (me_.down > 0) status = 'Back to the post…'
  else status = `${SCENES[scene].name} · ${starCount(me_)}/${SCENES[scene].stars.length} ★`

  return (
    <main className="dash">
      <div className="mt-hud">
        {card(0)}
        <div className="dash-to">
          <span className="label">{st.need > 1 ? `Race ${live.g}` : 'One race'}</span>
          <span className="dash-to__scene">{SCENES[scene].name}</span>
        </div>
        {card(1)}
      </div>
      <p className={`dash-status${me_.down > 0 ? ' dash-status--down' : ''}`} role="status">
        {status}
      </p>
      {/* the whole page is the button; the pad at the bottom keeps thumbs off the board */}
      <div
        className="dash-stage"
        onPointerDown={(e) => {
          e.preventDefault()
          tap()
        }}
      >
        <div className="dash-pad" aria-hidden="true">
          <span className="dash-pad__word">Jump</span>
          {live.g === 1 && t < 5000 && !over && <p className="dash-hint">Tap to jump · tap again in the air to jump again · first to the flag</p>}
        </div>
      </div>
      <div className="dash-board" data-ult-board>
        <Board scene={scene} seat={mine} frame={frame} />
        {banner && (
          <div key={banner.n} className={`dash-banner${banner.mine ? ' dash-banner--mine' : ''}`} aria-hidden="true">
            {banner.text}
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

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: DashState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const l = st.live
  const winner = (l.result?.winner ?? (l.wins[0] >= l.wins[1] ? 0 : 1)) as Seat
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
    session.start({ ...initialDashState(st.need, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.need, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, dashFeats(l))
  const scoreLine = `${l.wins[0]} — ${l.wins[1]}`
  const card: CardInput = {
    game: 'Flag Dash',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(l.wins[k]), meta: 'races' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: !l.last ? [] : [0, 1].map((k) => ({ word: names[k], seat: k as Seat, note: (l.last!.times?.[k] ?? -1) >= 0 ? `last race ${(l.last!.times[k] / 1000).toFixed(1)}s` : 'last race: no finish' })) },
  }

  return (
    <main className="dash dash-results screen-in">
      {iWon && <Confetti />}
      <div className="dash-results__head">
        <ResultMark winner={winner} />
        <h1 className={`dash-results__title${iWon ? ' dash-results__title--win' : ''}`}>{iWon ? 'You win' : `${seats[winner]?.name ?? 'Ops'} wins`}</h1>
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={l.wins[0]} meta="Races" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={l.wins[1]} meta="Races" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Flag Dash', GAME, names, winner, scoreLine)}
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
