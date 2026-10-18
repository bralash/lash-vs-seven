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
import { OPS_THINK, opsFlick } from './bot'
import { footballFeats } from './feats'
import { BALL, BODIES, BR, FRAME_DT, LENGTH, R, WIDTH, simulate, teamOf } from './physics'
import { Ball, Disc, PitchArt, S, VH, VW, X, Y } from './Pitch'
import { GOAL_MS, freshLive, playFlick, type Live } from './rules'
import '../../styles/football.css'

const GAME = 'football'
export const seriesLabel = (target: number) => `First to ${target}`

export interface FootballState {
  /** goals needed to win */
  target: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialFootballState(target = 3, match = 1): FootballState {
  return { target, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

/** how far back a full-power pull goes (pitch widths) */
const PULL = 0.3
const COLOUR = ['Orange', 'Blue']

export function FootballMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as FootballState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const watching = !!session.watching
  const vsOps = !!session.bot
  const mine = (s: Seat) => !session.local && !watching && s === me.seat
  const seats = playersBySeat(room)
  const name = (s: Seat) => (mine(s) ? 'You' : (seats[s]?.name ?? (s === 0 ? 'Player 1' : 'Player 2')))
  // online, the second player sees the pitch turned round, so they too attack up the screen
  const flip = !session.local && !watching && me.seat === 1
  const vx = (x: number) => (flip ? WIDTH - x : x)
  const vy = (y: number) => (flip ? LENGTH - y : y)

  /* ── the flick that just came in plays out on screen before anything else changes ── */
  const [settled, setSettled] = useState<number | undefined>(live.shot?.n)
  const [goalFlash, setGoalFlash] = useState<number | null>(null)
  const rolling = !!live.shot && live.shot.n !== settled
  const seriesOver = !!live.result
  const showResults = useHold(seriesOver && !rolling, 600)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !seriesOver
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch && !vsOps)

  const bodyEls = useRef<(SVGGElement | null)[]>([])
  const place = (p: ArrayLike<number>) => {
    for (let i = 0; i < BODIES; i++) bodyEls.current[i]?.setAttribute('transform', `translate(${X(vx(p[i * 2]))} ${Y(vy(p[i * 2 + 1]))})`)
  }
  useEffect(() => {
    if (!rolling) place(live.pos)
  })

  useEffect(() => {
    const shot = live.shot
    if (!shot || shot.n === settled) return
    const out = simulate(shot.from, shot)
    let raf = 0
    let hold = 0
    const t0 = performance.now()
    let e = 0
    let lastSound = 0
    sound('kick')
    const tick = (now: number) => {
      const t = Math.max(0, (now - t0) / 1000)
      const k = Math.min(out.frames.length - 1, Math.floor(t / FRAME_DT))
      place(out.frames[k])
      while (e < out.events.length && out.events[e].t <= t) {
        const ev = out.events[e++]
        if (ev.k === 'goal') {
          sound('net')
          sound('roar')
          setGoalFlash(shot.n)
          continue
        }
        if (now - lastSound < 45) continue
        lastSound = now
        if (ev.k === 'post') sound('post')
        else if (ev.k === 'hit' && ev.speed > 0.08) sound(ev.ball ? 'kick' : 'clack')
        else if (ev.k === 'wall' && ev.speed > 0.4) sound('tick')
      }
      if (k >= out.frames.length - 1) {
        // a goal: let it sink in before everyone lines up again
        if (out.goal) hold = window.setTimeout(() => (setGoalFlash(null), setSettled(shot.n)), GOAL_MS)
        else setSettled(shot.n)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => (cancelAnimationFrame(raf), clearTimeout(hold))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.shot?.n])

  useEffect(() => {
    if (seriesOver && !rolling) sound('fullTime')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesOver && !rolling])

  /* ── Ops lines up her flick once everything has stopped ── */
  const level = session.level ?? 'medium'
  useEffect(() => {
    if (!vsOps || !inMatch || rolling || live.turn !== 1) return
    const [lo, hi] = OPS_THINK[level]
    const n = live.shot?.n ?? 0
    const t = setTimeout(() => {
      const f = opsFlick(live.pos, 1, level)
      session.move<Live>((cur) => ((cur.shot?.n ?? 0) === n ? playFlick(cur, 1, f, st.target) : undefined)).catch(() => {})
    }, lo + Math.random() * (hi - lo))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsOps, inMatch, rolling, live.turn, live.shot?.n, level])

  /* ── flicking: put a finger on one of your discs, pull back, let go ── */
  const myTurn = inMatch && !watching && !rolling && (session.local ? true : live.turn === me.seat) && !(vsOps && live.turn !== 0)
  const svg = useRef<SVGSVGElement>(null)
  const [aim, setAimState] = useState<{ disc: number; x: number; y: number } | null>(null)
  const aimRef = useRef(aim)
  const setAim = (a: typeof aim) => {
    aimRef.current = a
    setAimState(a)
  }
  useEffect(() => setAim(null), [myTurn])

  /** a finger on the pitch, in pitch units */
  const toPitch = (e: { clientX: number; clientY: number }) => {
    const el = svg.current
    const m = el?.getScreenCTM()
    if (!el || !m) return null
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: vx((q.x - X(0)) / S), y: vy((q.y - Y(0)) / S) }
  }
  const onDown = (e: ReactPointerEvent) => {
    const t = toPitch(e)
    if (!myTurn || !t) return
    let best = -1
    let bestD = R * 1.6
    for (let i = 0; i < 10; i++) {
      if (teamOf(i) !== live.turn) continue
      const d = Math.hypot(live.pos[i * 2] - t.x, live.pos[i * 2 + 1] - t.y)
      if (d < bestD) (bestD = d), (best = i)
    }
    if (best < 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setAim({ disc: best, ...t })
  }
  const onMove = (e: ReactPointerEvent) => {
    const a = aimRef.current
    const t = a && toPitch(e)
    if (a && t) setAim({ ...a, ...t })
  }
  const pullOf = (a: { disc: number; x: number; y: number }) => {
    const dx = live.pos[a.disc * 2] - a.x
    const dy = live.pos[a.disc * 2 + 1] - a.y
    const d = Math.hypot(dx, dy)
    return { angle: Math.atan2(dy, dx), power: Math.min(d, PULL) / PULL }
  }
  const onUp = () => {
    const a = aimRef.current
    setAim(null)
    if (!a || !myTurn) return
    const { angle, power } = pullOf(a)
    // a short pull is a change of mind
    if (power < 0.1) return
    const by = live.turn
    session.move<Live>((cur) => playFlick(cur, by, { disc: a.disc, angle, power }, st.target)).catch(() => {})
  }

  /* ── screens ── */
  const card = (s: Seat) => (
    <ScoreCard p={seats[s]} you={mine(s)} active={session.local && inMatch && live.turn === s} turn={inMatch && !rolling && live.turn === s} value={live.scores[`s${s}`]} meta={COLOUR[s]} />
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

  const lastGoal = live.goals?.[live.goals.length - 1]
  const flash = goalFlash !== null && lastGoal ? (lastGoal.for !== lastGoal.by ? `Own goal! ${name(lastGoal.for)} score${mine(lastGoal.for) ? '' : 's'}` : `Goal! ${name(lastGoal.for)}`) : null
  const aiming = aim && pullOf(aim)
  const ad = aiming && { x: Math.cos(aiming.angle), y: Math.sin(aiming.angle) }
  const aimer = aim && { x: live.pos[aim.disc * 2], y: live.pos[aim.disc * 2 + 1] }
  const hint = rolling || !inMatch
    ? null
    : myTurn
      ? session.local
        ? `${name(live.turn)}’s flick · ${COLOUR[live.turn].toLowerCase()}`
        : 'Your flick · pull a disc back, let go'
      : watching
        ? `${name(live.turn)}’s flick`
        : `${name(live.turn)} ${vsOps ? 'is lining one up' : 'is lining up a flick'}`

  return (
    <main className="fbm screen-in">
      <div className="mt-hud">
        {card(0)}
        <div className="fbm-to">
          <span className="label">Goals</span>
          <span>{seriesLabel(st.target)}</span>
        </div>
        {card(1)}
      </div>

      <div className="fbm-stage">
        <svg
          ref={svg}
          className="fbm-pitch"
          viewBox={`0 0 ${VW} ${VH}`}
          data-ult-board
          aria-label="The pitch"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setAim(null)}
        >
          <PitchArt />

          {/* the pull: a ring round the disc that grows, and a dotted line the way it'll go */}
          {aimer && aiming && ad && aiming.power >= 0.1 && (
            <g pointerEvents="none" className="fbm-aim">
              <line
                x1={X(vx(aimer.x))}
                y1={Y(vy(aimer.y))}
                x2={X(vx(aimer.x + ad.x * (R + 0.08 + aiming.power * 0.45)))}
                y2={Y(vy(aimer.y + ad.y * (R + 0.08 + aiming.power * 0.45)))}
              />
              <circle cx={X(vx(aimer.x))} cy={Y(vy(aimer.y))} r={(R + 0.02 + aiming.power * 0.05) * S} className={aiming.power > 0.9 ? 'fbm-aim__full' : ''} />
            </g>
          )}

          {Array.from({ length: BODIES }, (_, i) => (
            <g key={i} ref={(el) => void (bodyEls.current[i] = el)} className={i === BALL ? undefined : `fbm-disc${myTurn && teamOf(i) === live.turn && !aim ? ' fbm-disc--go' : ''}`}>
              {i === BALL ? <Ball r={BR * S} /> : <Disc seat={teamOf(i)} r={R * S} />}
              {i !== BALL && myTurn && teamOf(i) === live.turn && !aim && <circle r={R * S + 5} className="fbm-ready" />}
            </g>
          ))}
        </svg>
        {flash && (
          <p key={goalFlash} className="fbm-goal" role="status">
            {flash}
          </p>
        )}
        {/* what to do now, over the near end of the pitch; out of the way while you pull */}
        {hint && !aim && (
          <p key={hint} className="fbm-hint" role="status">
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

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: FootballState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const s = [st.live.scores.s0, st.live.scores.s1]
  const winner = (st.live.result?.winner ?? (s[0] > s[1] ? 0 : 1)) as Seat
  const noYou = session.local || !!session.watching
  const iWon = noYou || winner === me.seat
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
    session.start({ ...initialFootballState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, footballFeats(st.live, st.target))
  const scoreLine = `${s[0]} — ${s[1]}`
  const goals = st.live.goals ?? []
  const note = (g: (typeof goals)[number]) => (g.for !== g.by ? `own goal by ${names[g.by]}` : g.long ? `${names[g.for]}, from their own half` : names[g.for])
  const card: CardInput = {
    game: 'Football',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: 'goals' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: goals.map((g) => ({ word: `${g.score[0]}–${g.score[1]}`, seat: g.for, note: note(g) })) },
  }

  return (
    <main className="fbm fbm-results screen-in">
      {iWon && <Confetti />}
      <div className="fbm-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match} · {seriesLabel(st.target).toLowerCase()}
        </p>
        <h1 className={`fbm-results__title${iWon ? ' fbm-results__title--win' : ''}`}>{iWon && !noYou ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}</h1>
        <p className="fbm-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
        {goals.length > 0 && (
          <ol className="fbm-results__goals">
            {goals.map((g, i) => (
              <li key={i}>
                {g.score[0]}–{g.score[1]} · {note(g)}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={!noYou && me.seat === 0} value={s[0]} meta="Goals" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!noYou && me.seat === 1} value={s[1]} meta="Goals" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Football', GAME, names, winner, scoreLine)}
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

