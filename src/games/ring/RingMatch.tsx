import { ref as dbRef, set } from 'firebase/database'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { CHAIN, DASH_MS, FIRST_MS, decide, freshLive, lapItems, opsTaps, settle, simulate, tapsOf, where, type RingLive, type Run, type Seat } from './engine'
import { ringFeats } from './feats'
import '../../styles/ring.css'

const GAME = 'ring'

/** online, the other run is judged this far behind (ms), so a tap still on its way isn't taken for a crash */
const GRACE = 1800
/** and shown this far behind */
const SHOWN_LAG = 300

export interface RingState {
  /** games to win the match */
  need: number
  match: number
  live: RingLive
  ready?: Record<string, boolean>
}

export function initialRingState(need = 2, match = 1): RingState {
  return { need, match, live: freshLive() }
}

/* ── the ring ── */

const R = 100
/** how far off the line the dot (and a square) sits, and how far a wall sticks out */
const OFF = 17
const WALL = 28

const polar = (f: number, r: number) => {
  const a = f * Math.PI * 2
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

/** how far from the middle the dot is at a moment: out, in, or on its way across */
function radiusAt(taps: number[], t: number): number {
  let n = 0
  let lastTap = -Infinity
  for (const x of taps) {
    if (x > t) break
    n++
    lastTap = x
  }
  const side = n % 2 ? -1 : 1
  const u = Math.min(1, (t - lastTap) / DASH_MS)
  // easing out of the old side into the new
  const from = -side
  const k = u >= 1 ? side : from + (side - from) * (1 - (1 - u) ** 2)
  return R + k * OFF
}

function RingView({ seed, taps, run, t, seat, mini, label }: { seed: number; taps: number[]; run: Run; t: number; seat: Seat; mini?: boolean; label?: string }) {
  // a run that's hit a wall stops there
  const at = run.crash !== null ? Math.min(t, run.crash) : t
  const { lap, f } = where(Math.max(0, at))
  const ahead = lapItems(seed, lap).filter((it) => it.a > f)
  // what's behind the dot is already the next lap, fading in
  const behind = lapItems(seed, lap + 1)
    .filter((it) => it.a <= f)
    .map((it) => ({ it, o: Math.min(1, (f - it.a) / 0.15) }))
  const items = [...ahead.map((it) => ({ it, o: 1 })), ...behind]
  const trail = [90, 60, 30].map((d) => {
    const tt = Math.max(0, at - d)
    const w = where(tt)
    return polar(w.f, radiusAt(taps, tt))
  })
  const dot = polar(f, radiusAt(taps, Math.max(0, at)))
  const out = run.crash !== null && t >= run.crash
  return (
    <svg className={`ring-svg${mini ? ' ring-svg--mini' : ''}`} viewBox="-140 -140 280 280" aria-label={label}>
      <circle className="ring-line" r={R} />
      {items.map(({ it, o }) =>
        it.kind === 'wall' ? (
          <line
            key={it.id}
            className={`ring-wall${run.hit === it.id ? ' ring-wall--hit' : ''}`}
            {...(() => {
              const a = polar(it.a, R)
              const b = polar(it.a, R + (it.side === 'out' ? WALL : -WALL))
              return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
            })()}
            opacity={o}
          />
        ) : run.taken.has(it.id) ? null : (
          <rect
            key={it.id}
            className="ring-square"
            x={-5}
            y={-5}
            width={10}
            height={10}
            opacity={o}
            transform={(() => {
              const p = polar(it.a, R + (it.side === 'out' ? OFF : -OFF))
              return `translate(${p.x} ${p.y}) rotate(${it.a * 360})`
            })()}
          />
        ),
      )}
      {!out && trail.map((p, i) => <circle key={i} className={`ring-trail ring-dot--s${seat}`} cx={p.x} cy={p.y} r={2 + i} opacity={0.25 + i * 0.15} />)}
      <circle className={`ring-dot ring-dot--s${seat}${out ? ' ring-dot--out' : ''}`} cx={dot.x} cy={dot.y} r={7.5} />
      <text className="ring-score" y={mini ? 22 : 18} textAnchor="middle">
        {t < 0 ? Math.ceil(-t / 1000) : run.score}
      </text>
      {!mini && run.chain > 0 && t >= 0 && !out && (
        <text className="ring-chain" y={48} textAnchor="middle">
          {run.chain % CHAIN}/{CHAIN} in a row
        </text>
      )}
    </svg>
  )
}

/** both rings, drawn every frame (on their own, so the rest of the screen isn't) */
function Rings(p: {
  live: RingLive
  now: () => number
  runsAt: (t: number) => { me_: Run; shown: Run; theirTaps: number[] }
  myTaps: { current: { taps: number[] } }
  mine: Seat
  theirs: Seat
  oppName: string
  lag: number
  children?: ReactNode
}) {
  const [, setFrame] = useState(0)
  useEffect(() => {
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      setFrame((n) => n + 1)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  const t = p.live.start ? Math.round(p.now() - p.live.start) : -FIRST_MS
  const { me_, shown, theirTaps } = p.runsAt(t)
  return (
    <>
      <div className="ring-board" data-ult-board>
        <RingView seed={p.live.seed} taps={p.myTaps.current.taps} run={me_} t={t} seat={p.mine} label="Your ring" />
        {p.children}
      </div>
      <div className="ring-opp" aria-label={`${p.oppName}’s ring`}>
        <RingView seed={p.live.seed} taps={theirTaps} run={shown} t={t - p.lag} seat={p.theirs} mini />
        <span className="ring-opp__name">{p.oppName}</span>
      </div>
    </>
  )
}

/* ── the match ── */

export function RingMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as RingState
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
  /** your taps this game (ms into the run), kept here as you make them */
  const myTaps = useRef<{ g: number; taps: number[] }>({ g: live.g, taps: [] })
  if (myTaps.current.g !== live.g) myTaps.current = { g: live.g, taps: [] }
  /** Ops' taps for this game, worked out when it starts */
  const ops = useMemo(() => (vsOps ? opsTaps(live.seed, level) : []), [vsOps, live.seed, level])
  const [, setTick] = useState(0)
  const [banner, setBanner] = useState<{ text: string; mine: boolean; n: number } | null>(null)

  // the first game: the host (or this phone, against Ops) sets it going
  useEffect(() => {
    if (live.start || over || !(me.isHost || vsOps)) return
    session.move<RingLive>((cur) => (cur.start || cur.result ? undefined : { ...cur, start: now() + FIRST_MS })).catch(() => {})
  }, [live.start, over, me.isHost, vsOps, session, now])

  /** the two runs as this phone sees them: yours to the moment, theirs as far as their taps can be trusted */
  const runsAt = useCallback(
    (t: number) => {
      const l = liveRef.current
      const theirTaps = vsOps ? ops : tapsOf(l, l.g, theirs)
      const me_ = simulate(l.seed, myTaps.current.taps, t)
      const them = simulate(l.seed, theirTaps, online ? t - GRACE : t)
      const shown = online ? simulate(l.seed, theirTaps, t - SHOWN_LAG) : them
      return { me_, them, shown, theirTaps }
    },
    [vsOps, ops, theirs, online],
  )

  /** a tap: dash across */
  const tap = useCallback(() => {
    const l = liveRef.current
    if (l.result || !l.start) return
    const t = Math.round(now() - l.start)
    if (t < 0) return
    const mineRun = simulate(l.seed, myTaps.current.taps, t)
    if (mineRun.crash !== null) return
    const list = myTaps.current.taps
    list.push(t)
    sound('tap')
    if (online) set(dbRef(db, `${roomPath(GAME, room.code)}/state/live/runs/g${l.g}/s${mine}/k${list.length - 1}`), t).catch(() => {})
  }, [now, online, room.code, mine, sound])

  // keys on a computer: space or any arrow
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === ' ' || e.key.startsWith('Arrow') || e.key === 'Enter') {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tap])

  // the frame loop: draw, sounds, and settling the game once it's decided
  const sent = useRef(0)
  const heard = useRef<{ g: number; id: string | null; out: boolean }>({ g: 0, id: null, out: false })
  useEffect(() => {
    if (showResults) return
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const l = liveRef.current
      if (!l.start || l.result) return
      const t = now() - l.start
      if (t < 0) return
      const { me_, them } = runsAt(t)
      // your pick-ups and your crash
      if (heard.current.g !== l.g) heard.current = { g: l.g, id: null, out: false }
      if (me_.last && me_.last.id !== heard.current.id) {
        heard.current.id = me_.last.id
        sound(me_.last.bonus ? 'findBig' : 'ping')
      }
      if (me_.crash !== null && !heard.current.out) {
        heard.current.out = true
        sound('boom')
        navigator.vibrate?.(80)
      }
      const runs: [Run, Run] = mine === 0 ? [me_, them] : [them, me_]
      const w = decide(runs[0], runs[1])
      if (w !== null && sent.current !== l.g) {
        sent.current = l.g
        const g = l.g
        session.move<RingLive>((cur) => settle(cur, g, w, runs, st.need, now())).catch(() => {})
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [showResults, now, runsAt, mine, session, st.need, sound])

  // the words round the rings (who's out, who needs what) keep up a few times a second; the rings draw every frame
  useEffect(() => {
    if (showResults) return
    const id = setInterval(() => setTick((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [showResults])

  // a game settled: the banner
  const seen = useRef(live.last?.g ?? 0)
  useEffect(() => {
    const last = live.last
    if (!last || last.g === seen.current) return
    seen.current = last.g
    const [a, b] = [last.scores[mine], last.scores[theirs]]
    const iWon = last.winner === mine
    if (!live.result) sound(last.winner === -1 ? 'tick' : iWon ? 'find' : 'error')
    const text = last.winner === -1 ? `Level on ${a} · again` : iWon ? `You take it · ${a} to ${b}` : `${oppName} takes it · ${b} to ${a}`
    const n = Date.now()
    setBanner({ text, mine: iWon, n })
    setTimeout(() => setBanner((x) => (x?.n === n ? null : x)), 2800)
  }, [live.last, live.result, mine, theirs, oppName, sound])

  /* ── screens ── */

  const t = live.start ? now() - live.start : -FIRST_MS
  const { me_, shown, them } = runsAt(Math.round(t))
  const scoreOf = (s: Seat) => (st.need > 1 ? live.wins[s] : s === mine ? me_.score : shown.score)
  const card = (s: Seat) => (
    <ScoreCard p={seats[s]} you={s === mine} value={scoreOf(s)} meta={st.need > 1 ? `Games · first to ${st.need}` : 'Points'} />
  )
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

  const running = live.start > 0 && t >= 0 && !over
  const imOut = me_.crash !== null
  const theyreOut = them.crash !== null
  let status: string
  if (over) status = ''
  else if (!live.start || t < 0) status = live.g === 1 ? 'Get ready' : `Game ${live.g}`
  else if (imOut && theyreOut) status = 'Both out'
  else if (imOut) status = `You’re out on ${me_.score} · ${oppName} needs ${me_.score + 1}`
  else if (theyreOut) status = `${oppName} is out on ${them.score} · get ${them.score + 1} to win`
  else status = 'Tap to dash across · dodge the walls'

  return (
    <main className="ring">
      <div className="mt-hud">
        {card(0)}
        <div className="ring-to">
          <span className="label">{st.need > 1 ? 'Game' : 'One game'}</span>
          <span className="ring-to__n">{st.need > 1 ? live.g : '1'}</span>
        </div>
        {card(1)}
      </div>
      <p className={`ring-status${imOut && !theyreOut && running ? ' ring-status--out' : ''}`} role="status">
        {status}
      </p>

      {/* the whole page is the button; the rings sit over it and let taps through */}
      <div
        className="ring-stage"
        onPointerDown={(e) => {
          e.preventDefault()
          tap()
        }}
      >
        {live.g === 1 && t < 6000 && !over && <p className="ring-hint">Tap anywhere: in and out of the ring · white squares score</p>}
      </div>
      <Rings live={live} now={now} runsAt={runsAt} myTaps={myTaps} mine={mine} theirs={theirs} oppName={oppName} lag={online ? SHOWN_LAG : 0}>
        {banner && (
          <div key={banner.n} className={`ring-banner${banner.mine ? ' ring-banner--mine' : ''}`} aria-hidden="true">
            {banner.text}
          </div>
        )}
      </Rings>
      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: RingState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
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
    session.start({ ...initialRingState(st.need, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.need, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, ringFeats(l))
  // one game: the points; a series: the games
  const one = st.need === 1
  const shownScore: [number, number] = one && l.last ? l.last.scores : l.wins
  const scoreLine = `${shownScore[0]} — ${shownScore[1]}`
  const top = l.top ?? [0, 0]
  const chain = l.chain ?? [0, 0]
  const card: CardInput = {
    game: 'Ring Dash',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(shownScore[k]), meta: one ? 'points' : 'games' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: [0, 1].map((k) => ({ word: names[k], seat: k as Seat, note: `best ${top[k]} · ${chain[k]} in a row` })) },
  }

  return (
    <main className="ring ring-results screen-in">
      {iWon && <Confetti />}
      <div className="ring-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match} · {one ? 'one game' : `first to ${st.need}`}
        </p>
        <h1 className={`ring-results__title${iWon ? ' ring-results__title--win' : ''}`}>{iWon ? 'You win' : `${seats[winner]?.name ?? 'Ops'} wins`}</h1>
        <p className="ring-results__line">
          {shownScore[0]} <span>—</span> {shownScore[1]}
        </p>
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={shownScore[0]} meta={`Best ${top[0]}`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={shownScore[1]} meta={`Best ${top[1]}`} />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Ring Dash', GAME, names, winner, scoreLine)}
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
