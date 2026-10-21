import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
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
import { OPS_THINK, opsShot } from './bot'
import { BAR_W, Ball, CourseArt, Flag, S, VH, VW, X, Y } from './Course'
import { golfFeats } from './feats'
import { holeById } from './holes'
import { CUP, FRAME_DT, R, barAt, simulate, type Hole } from './physics'
import { HOLES_PER_MATCH, HOLE_MS, PICKED_UP, cardOf, freshLive, parOf, playShot, totalOf, type Live } from './rules'
import '../../styles/golf.css'

const GAME = 'golf'

export interface GolfState {
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialGolfState(match = 1): GolfState {
  return { match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

/** how far a full-strength pull goes (course widths) */
const PULL = 0.42
/** let go this close to where you started and nothing happens: the shot is called off */
const CANCEL = 0.035
const COLOUR = ['Orange', 'Blue']
const rnd = (v: number) => Math.round(v * 1e4) / 1e4

export function GolfMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as GolfState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const watching = !!session.watching
  const vsOps = !!session.bot
  const mine = (s: Seat) => !session.local && !watching && s === me.seat
  const seats = playersBySeat(room)
  const name = (s: Seat) => (mine(s) ? 'You' : (seats[s]?.name ?? (s === 0 ? 'Player 1' : 'Player 2')))

  /* ── the shot that just came in plays out on screen before anything else changes ── */
  const [settled, setSettled] = useState<number | undefined>(live.shot?.n)
  const [flash, setFlash] = useState<{ n: number; text: string } | null>(null)
  const rolling = !!live.shot && live.shot.n !== settled
  const shot = live.shot
  // while a shot plays out, the hole it was played on (the state may already be on the next one)
  const at = rolling && shot ? shot.at : live.at
  const hole = holeById(live.holes[at])
  const seriesOver = !!live.result
  const showResults = useHold(seriesOver && !rolling, 900)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !seriesOver
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch && !vsOps)

  /* ── the moving blocker's clock: every screen restarts it from the shot's phase, so they agree ── */
  const clock = useRef({ phase: 0, at: performance.now() })
  const phaseNow = () => clock.current.phase + (performance.now() - clock.current.at) / 1000
  const barEl = useRef<SVGLineElement>(null)
  const stripeEl = useRef<SVGLineElement>(null)
  useEffect(() => {
    const m = hole.mover
    if (!m) return
    let raf = 0
    const tick = () => {
      const [a, b] = barAt(m, phaseNow())
      for (const el of [barEl.current, stripeEl.current]) {
        el?.setAttribute('x1', String(X(a[0])))
        el?.setAttribute('y1', String(Y(a[1])))
        el?.setAttribute('x2', String(X(b[0])))
        el?.setAttribute('y2', String(Y(b[1])))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hole])

  /* ── replaying a shot ── */
  const ballEls = useRef<(SVGGElement | null)[]>([])
  // once a shot has played out, put every ball where the match says it is: the replay moved the
  // shooter's by hand, and after a splash that spot (in the water) isn't where it went back to
  useEffect(() => {
    if (rolling) return
    for (const s of [0, 1] as Seat[]) ballEls.current[s]?.setAttribute('transform', `translate(${X(live.balls[s].x)} ${Y(live.balls[s].y)})`)
  })
  const [nearCup, setNearCup] = useState(false)
  useEffect(() => {
    if (!shot || shot.n === settled) return
    const h = holeById(live.holes[shot.at])
    const out = simulate(h, shot.from, shot)
    clock.current = { phase: shot.phase, at: performance.now() }
    let raf = 0
    let hold = 0
    let e = 0
    let lastSound = 0
    const t0 = performance.now()
    const el = ballEls.current[shot.by]
    sound('cue')
    const tick = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000)
      const k = Math.min(out.frames.length - 1, Math.floor(t / FRAME_DT))
      const [x, y] = out.frames[k]
      el?.setAttribute('transform', `translate(${X(x)} ${Y(y)})`)
      setNearCup(Math.hypot(x - h.cup[0], y - h.cup[1]) < 0.16)
      while (e < out.events.length && out.events[e].t <= t) {
        const ev = out.events[e++]
        if (ev.k === 'in') {
          sound('pot')
          el?.classList.add('golf-ball--sink')
          continue
        }
        if (ev.k === 'splash') {
          sound('splat')
          continue
        }
        if (now - lastSound < 45) continue
        lastSound = now
        if (ev.k === 'bump') sound('clink')
        else if (ev.k === 'lip') sound('tick')
        else if (ev.k === 'wall' && ev.speed > 0.15) sound('clack')
      }
      if (k >= out.frames.length - 1) {
        const shots = shot.at === live.at ? live.balls[shot.by].n : cardOf(live, shot.by)[shot.at]
        const who = name(shot.by)
        const text = shot.holed ? (shots === 1 ? `Ace! ${who}` : `In! ${who} · ${shots}`) : shot.wet ? `Splash! +1 · ${who}` : shot.up ? `Picked up · ${who} · ${PICKED_UP}` : null
        if (text) setFlash({ n: shot.n, text })
        if (shot.holed && shots === 1) sound('findBig')
        // the hole is over: let it sink in before the next one comes up
        const next = shot.at !== live.at || !!live.result
        const done = () => {
          el?.classList.remove('golf-ball--sink')
          setNearCup(false)
          setSettled(shot.n)
        }
        if (next) hold = window.setTimeout(done, HOLE_MS)
        else if (shot.wet) hold = window.setTimeout(done, 650)
        else done()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => (cancelAnimationFrame(raf), clearTimeout(hold), el?.classList.remove('golf-ball--sink'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot?.n])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(t)
  }, [flash])

  /* ── "Hole 3 · Par 3" as each hole comes up ── */
  const [intro, setIntro] = useState<number | null>(null)
  const introduced = useRef('')
  useEffect(() => {
    const key = `${st.match}:${live.at}`
    if (rolling || !inMatch || introduced.current === key) return
    introduced.current = key
    setIntro(live.at)
  }, [st.match, live.at, rolling, inMatch])
  useEffect(() => {
    if (intro === null) return
    const t = setTimeout(() => setIntro(null), 1500)
    return () => clearTimeout(t)
  }, [intro])

  useEffect(() => {
    if (seriesOver && !rolling) sound('end')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesOver && !rolling])

  /* ── Ops lines up her shot once everything has stopped ── */
  const level = session.level ?? 'medium'
  useEffect(() => {
    if (!vsOps || !inMatch || rolling || live.turn !== 1 || live.balls[1].done) return
    const [lo, hi] = OPS_THINK[level]
    const n = live.shot?.n ?? 0
    const t = setTimeout(() => {
      const b = live.balls[1]
      const s = opsShot(holeById(live.holes[live.at]), [b.x, b.y], rnd(phaseNow()), level)
      session.move<Live>((cur) => ((cur.shot?.n ?? 0) === n ? playShot(cur, 1, s) : undefined)).catch(() => {})
    }, lo + Math.random() * (hi - lo))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsOps, inMatch, rolling, live.turn, live.shot?.n, level])

  /* ── aiming: put a finger down anywhere, drag back away from where you want it to go, let go ── */
  const myTurn = inMatch && !watching && !rolling && (session.local ? true : live.turn === me.seat) && !(vsOps && live.turn !== 0)
  const svg = useRef<SVGSVGElement>(null)
  type Aim = { x0: number; y0: number; x: number; y: number }
  const [aim, setAimState] = useState<Aim | null>(null)
  const aimRef = useRef(aim)
  const setAim = (a: Aim | null) => {
    aimRef.current = a
    setAimState(a)
  }
  useEffect(() => setAim(null), [myTurn])

  const toCourse = (e: { clientX: number; clientY: number }) => {
    const m = svg.current?.getScreenCTM()
    if (!m) return null
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: (q.x - X(0)) / S, y: (q.y - Y(0)) / S }
  }
  const onDown = (e: ReactPointerEvent) => {
    const t = toCourse(e)
    if (!myTurn || !t) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setAim({ x0: t.x, y0: t.y, ...t })
  }
  const onMove = (e: ReactPointerEvent) => {
    const a = aimRef.current
    const t = a && toCourse(e)
    if (a && t) setAim({ ...a, ...t })
  }
  const pullOf = (a: Aim) => {
    const dx = a.x0 - a.x
    const dy = a.y0 - a.y
    const d = Math.hypot(dx, dy)
    return { angle: Math.atan2(dy, dx), power: Math.max(0, Math.min(d - CANCEL, PULL)) / PULL, off: d < CANCEL }
  }
  const onUp = () => {
    const a = aimRef.current
    setAim(null)
    if (!a || !myTurn) return
    const { angle, power, off } = pullOf(a)
    if (off) return
    const by = live.turn
    const s = { angle: rnd(angle), power: rnd(power), phase: rnd(phaseNow()) }
    session.move<Live>((cur) => playShot(cur, by, s)).catch(() => {})
  }

  /* ── screens ── */
  const meta = (s: Seat) => {
    if (seriesOver) return COLOUR[s]
    const b = live.balls[s]
    if (b.done) return b.n >= PICKED_UP ? 'Picked up' : `In · ${b.n}`
    return `${b.n} shot${b.n === 1 ? '' : 's'}`
  }
  const card = (s: Seat) => {
    const total = totalOf(live, s)
    return <ScoreCard p={seats[s]} you={mine(s)} active={session.local && inMatch && live.turn === s} turn={inMatch && !rolling && live.turn === s} value={total} score={-total} meta={meta(s)} />
  }

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

  const playoff = at >= HOLES_PER_MATCH
  const aiming = aim && pullOf(aim)
  const turnBall = live.balls[live.turn]
  const hint = rolling || !inMatch || intro !== null
    ? null
    : aiming
      ? aiming.off
        ? 'Let go here to cancel'
        : 'Back to where you started to cancel'
      : myTurn
        ? session.local
          ? `${name(live.turn)}’s shot · ${COLOUR[live.turn].toLowerCase()}`
          : 'Your shot · drag back anywhere, let go'
        : watching
          ? `${name(live.turn)}’s shot`
          : `${name(live.turn)} ${vsOps ? 'is lining one up' : 'is lining up a shot'}`

  // where each ball sits: the shooter's is moved frame by frame while a shot rolls
  const ballAt = (s: Seat) => {
    if (rolling && shot && s === shot.by) return { x: shot.from[0], y: shot.from[1], show: true }
    const b = live.balls[s]
    if (rolling && shot && shot.at !== live.at) return { x: b.x, y: b.y, show: false }
    return { x: b.x, y: b.y, show: !b.done }
  }

  return (
    <main className="golf screen-in">
      <div className="mt-hud">
        {card(0)}
        <div className="golf-hole">
          <span className="label">{playoff ? 'Playoff' : `Hole ${at + 1}/${HOLES_PER_MATCH}`}</span>
          <span>Par {hole.par}</span>
        </div>
        {card(1)}
      </div>

      <div className="golf-stage">
        <svg
          ref={svg}
          className="golf-course"
          viewBox={`0 0 ${VW} ${VH}`}
          data-ult-board
          aria-label={`${hole.name}, par ${hole.par}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setAim(null)}
        >
          <CourseArt hole={hole} />
          {hole.mover && <Blocker hole={hole} barEl={barEl} stripeEl={stripeEl} phase={phaseNow()} />}

          {/* the ball to play goes on top */}
          {((live.turn === 0 ? [1, 0] : [0, 1]) as Seat[]).map((s) => {
            const b = ballAt(s)
            return (
              <g key={`${at}:${s}`} ref={(el) => void (ballEls.current[s] = el)} transform={`translate(${X(b.x)} ${Y(b.y)})`} className="golf-ball" style={b.show ? undefined : { display: 'none' }}>
                {myTurn && live.turn === s && !aim && <circle r={R * S + 6} className="golf-ready" />}
                <Ball seat={s} />
              </g>
            )
          })}

          {/* the pull: from the ball, a dotted line the way it'll go, longer the harder; a ring that fills */}
          {aim && aiming && !aiming.off && (
            <g pointerEvents="none" className="golf-aim">
              <line className="golf-aim__drag" x1={X(aim.x0)} y1={Y(aim.y0)} x2={X(aim.x)} y2={Y(aim.y)} />
              <line
                x1={X(turnBall.x)}
                y1={Y(turnBall.y)}
                x2={X(turnBall.x + Math.cos(aiming.angle) * (R + 0.06 + aiming.power * 0.5))}
                y2={Y(turnBall.y + Math.sin(aiming.angle) * (R + 0.06 + aiming.power * 0.5))}
              />
              <circle cx={X(turnBall.x)} cy={Y(turnBall.y)} r={(R + 0.015 + aiming.power * 0.045) * S} className={aiming.power > 0.95 ? 'golf-aim__full' : ''} />
            </g>
          )}
          <Flag hole={hole} faint={nearCup || (!rolling && [0, 1].some((s) => !live.balls[s].done && Math.hypot(live.balls[s].x - hole.cup[0], live.balls[s].y - hole.cup[1]) < CUP + 0.12))} />
        </svg>
        {intro !== null && (
          <p key={`i${intro}`} className="golf-stamp golf-stamp--intro" role="status">
            {intro >= HOLES_PER_MATCH ? 'Playoff' : `Hole ${intro + 1}`}
            <small>
              {hole.name} · par {hole.par}
            </small>
          </p>
        )}
        {flash && (
          <p key={flash.n} className="golf-stamp" role="status">
            {flash.text}
          </p>
        )}
        {hint && (
          <p key={hint} className="golf-hint" role="status">
            {hint}
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

function Blocker({ hole, barEl, stripeEl, phase }: { hole: Hole; barEl: React.RefObject<SVGLineElement | null>; stripeEl: React.RefObject<SVGLineElement | null>; phase: number }) {
  const [a, b] = barAt(hole.mover!, phase)
  const p = { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]) }
  return (
    <g pointerEvents="none">
      <line ref={barEl} {...p} stroke="var(--ink)" strokeWidth={BAR_W + 2} strokeLinecap="round" />
      <line ref={stripeEl} {...p} stroke="#ffd23f" strokeWidth={BAR_W - 5} strokeDasharray="7 7" />
    </g>
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: GolfState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const winner = (live.result?.winner ?? -1) as Seat | -1
  const noYou = session.local || !!session.watching
  const iWon = winner !== -1 && (noYou || winner === me.seat)
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
  const oppGone = !session.bot && (room.status === 'abandoned' || !opp?.online)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialGolfState(st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, golfFeats(live))
  const c = [cardOf(live, 0), cardOf(live, 1)]
  const sum = (k: number) => c[k].slice(0, HOLES_PER_MATCH).reduce((a, b) => a + b, 0)
  const parTotal = live.holes.slice(0, HOLES_PER_MATCH).reduce((a, id) => a + holeById(id).par, 0)
  const played = Math.max(c[0].length, c[1].length)
  const playoff = played > HOLES_PER_MATCH
  const scoreLine = playoff ? `${sum(0)} — ${sum(1)} · playoff ${c[0][HOLES_PER_MATCH]}–${c[1][HOLES_PER_MATCH]}` : `${sum(0)} — ${sum(1)}`
  const card: CardInput = {
    game: 'Mini Golf',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(sum(k)), meta: 'shots' })) as CardInput['players'],
    detail: {
      kind: 'rounds',
      rows: Array.from({ length: played }, (_, at) => ({
        word: at >= HOLES_PER_MATCH ? `Playoff · par ${parOf(live, at)}` : `Hole ${at + 1} · par ${parOf(live, at)}`,
        seat: c[0][at] < c[1][at] ? 0 : c[1][at] < c[0][at] ? 1 : null,
        note: `${c[0][at]}–${c[1][at]}`,
      })),
    },
  }
  const title = winner === -1 ? 'Draw' : iWon && !noYou ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`

  return (
    <main className="golf golf-results screen-in">
      {iWon && <Confetti />}
      <div className="golf-results__head">
        <ResultMark winner={winner} />
        <h1 className={`golf-results__title${iWon ? ' golf-results__title--win' : ''}`}>{title}</h1>
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={!noYou && me.seat === 0} value={sum(0)} score={-sum(0)} meta="Shots" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!noYou && me.seat === 1} value={sum(1)} score={-sum(1)} meta="Shots" />
      </div>
      <table className="golf-card">
        <thead>
          <tr>
            <th>Hole</th>
            <th>Par</th>
            <th className="golf-card--0">{names[0]}</th>
            <th className="golf-card--1">{names[1]}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: played }, (_, at) => (
            <tr key={at} className={at === HOLES_PER_MATCH ? 'golf-card__playoff' : undefined}>
              <td>{at >= HOLES_PER_MATCH ? 'Playoff' : at + 1}</td>
              <td>{parOf(live, at)}</td>
              {[0, 1].map((k) => (
                <td key={k} className={c[k][at] === 1 ? 'golf-card__ace' : c[k][at] < parOf(live, at) ? 'golf-card__under' : undefined}>
                  {c[k][at] ?? '–'}
                </td>
              ))}
            </tr>
          ))}
          <tr className="golf-card__total">
            <td>Total</td>
            <td>{parTotal}</td>
            <td>{sum(0)}</td>
            <td>{sum(1)}</td>
          </tr>
        </tbody>
      </table>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Mini Golf', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={oppGone}
        onReady={() => {
          sound('tap')
          session.ready(me.id)
        }}
        onLeave={exit.now}
        watching={session.watching}
      />
    </main>
  )
}
