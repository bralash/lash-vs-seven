import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
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
import { useRivalry } from '../../match/useRivalry'
import { BALLS, FRAME_DT, OFF, POCKETS, R, guide, simulate, type Ev } from './physics'
import { Ball, Cue, RAIL, S, TableArt, VH, VW, X, Y } from './Table'
import { RESULT_MS, freshLive, groupName, left, nextFrame, playShot, type Live } from './rules'
import '../../styles/pool.css'

const GAME = 'pool'
/** "Single frame" / "Best of 3" from the number of frames needed */
export const seriesLabel = (target: number) => (target === 1 ? 'Single frame' : `Best of ${target * 2 - 1}`)

export interface PoolState {
  /** frames needed to win the match */
  target: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialPoolState(target = 2, match = 1): PoolState {
  return { target, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

/** the cue's length on the table (table widths) */
const STICK_LEN = 0.85

export function PoolMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as PoolState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const watching = !!session.watching
  const mine = (s: Seat) => !session.local && !watching && s === me.seat
  const seats = playersBySeat(room)
  const name = (s: Seat) => (mine(s) ? 'You' : (seats[s]?.name ?? (s === 0 ? 'Player 1' : 'Player 2')))

  /* ── the shot that just came in plays out on screen before anything else changes ── */
  const [settled, setSettled] = useState<number | undefined>(live.shot?.n)
  const rolling = !!live.shot && live.shot.n !== settled
  const seriesOver = live.scores.s0 >= st.target || live.scores.s1 >= st.target
  const showResults = useHold(seriesOver && !rolling, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !seriesOver
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)

  const ballEls = useRef<(SVGGElement | null)[]>([])
  const place = (p: ArrayLike<number>) => {
    for (let i = 0; i < BALLS; i++) {
      const el = ballEls.current[i]
      if (!el) continue
      if (p[i * 2] === OFF) el.style.display = 'none'
      else {
        el.style.display = ''
        el.style.opacity = ''
        el.setAttribute('transform', `translate(${X(p[i * 2])} ${Y(p[i * 2 + 1])})`)
      }
    }
  }
  // at rest the balls sit where the frame says
  useEffect(() => {
    if (!rolling) place(live.pos)
  })

  useEffect(() => {
    const shot = live.shot
    if (!shot || shot.n === settled) return
    const out = simulate(shot.from, shot)
    const events = out.events.slice().sort((a, b) => a.t - b.t)
    let raf = 0
    const t0 = performance.now()
    let e = 0
    let lastSound = 0
    /** balls on their way down a pocket: from where they dropped to the hole's middle, shrinking into the dark */
    const sinking: { ball: number; x: number; y: number; to: { x: number; y: number }; at: number }[] = []
    const SINK_MS = 280
    sound('cue')
    const tick = (now: number) => {
      // (a frame's time can be a hair before the strike)
      const t = Math.max(0, (now - t0) / 1000)
      const k = Math.min(out.frames.length - 1, Math.floor(t / FRAME_DT))
      place(out.frames[k])
      // the knocks, the cushions and the pockets, as they happen (not too many at once)
      while (e < events.length && events[e].t <= t) {
        const ev: Ev = events[e++]
        if (now - lastSound < 45 && ev.k !== 'pot') continue
        lastSound = now
        if (ev.k === 'pot') sinking.push({ ball: ev.a, x: ev.x, y: ev.y, to: POCKETS[ev.pocket], at: now })
        if (ev.k === 'pot') sound('pot')
        else if (ev.k === 'ball' && ev.speed > 0.05) sound('clink')
        else if (ev.k === 'cushion' && ev.speed > 0.3) sound('tick')
      }
      let sinkingNow = false
      for (const sk of sinking) {
        const u = (now - sk.at) / SINK_MS
        const el = ballEls.current[sk.ball]
        if (!el || u >= 1) continue
        sinkingNow = true
        const ease = u * u
        el.style.display = ''
        el.style.opacity = String(1 - ease * 0.85)
        el.setAttribute('transform', `translate(${X(sk.x + (sk.to.x - sk.x) * ease)} ${Y(sk.y + (sk.to.y - sk.y) * ease)}) scale(${1 - 0.45 * ease})`)
      }
      if (k >= out.frames.length - 1 && !sinkingNow) {
        setSettled(shot.n)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.shot?.n])

  // a finished frame: a pause, then the next rack (the match ends on the results screen)
  useEffect(() => {
    if (!live.result || seriesOver || abandoned || rolling) return
    const finished = live.frame
    const t = setTimeout(() => session.move<Live>((cur) => nextFrame(cur, finished)).catch(() => {}), RESULT_MS)
    return () => clearTimeout(t)
  }, [session, live.result, live.frame, seriesOver, abandoned, rolling])
  useEffect(() => {
    if (live.result && !rolling) sound(session.local || watching || live.result.winner === me.seat ? 'findBig' : 'end')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!live.result && !rolling])

  /* ── aiming ── */
  const myTurn = inMatch && !watching && !rolling && !live.result && (session.local || live.turn === me.seat)
  const [angle, setAngle] = useState(-Math.PI / 2)
  const [power, setPower] = useState(0)
  /** where on the cue ball you hit it: x left (−) / right (+), y draw (−) / follow (+), inside a circle of 1 */
  const [spin, setSpin] = useState({ x: 0, y: 0 })
  const [spinOpen, setSpinOpen] = useState(false)
  const tableEl = useRef<SVGSVGElement>(null)
  const aimGuide = useMemo(() => (myTurn ? guide(live.pos, angle) : null), [myTurn, live.pos, angle])

  /** a finger on the table, in table units */
  const toTable = (e: { clientX: number; clientY: number }) => {
    const box = tableEl.current?.getBoundingClientRect()
    if (!box?.width) return null
    return { x: (((e.clientX - box.left) / box.width) * VW - RAIL) / S, y: (((e.clientY - box.top) / box.height) * VH - RAIL) / S }
  }
  const cue = { x: live.pos[0], y: live.pos[1] }
  const angleRef = useRef(angle)
  angleRef.current = angle
  const aimAt = (t: { x: number; y: number }) => {
    const dx = t.x - cue.x
    const dy = t.y - cue.y
    // right on top of the cue ball the angle jumps about: leave it
    if (Math.hypot(dx, dy) > R * 1.5) setAngle(Math.atan2(dy, dx))
  }
  /** is this spot on the cue (behind the ball, along the stick)? */
  const onStick = (t: { x: number; y: number }) => {
    const dx = Math.cos(angleRef.current)
    const dy = Math.sin(angleRef.current)
    const rx = t.x - cue.x
    const ry = t.y - cue.y
    const behind = -(rx * dx + ry * dy)
    return behind > R && behind < R + 0.06 + STICK_LEN && Math.abs(rx * dy - ry * dx) < 0.08
  }
  /** A finger on the table either points where to send the cue ball, or holds the cue and turns it round the ball. */
  const grip = useRef<null | 'aim' | 'stick'>(null)
  const onTableDown = (e: ReactPointerEvent) => {
    const t = toTable(e)
    if (!myTurn || !t) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    grip.current = onStick(t) ? 'stick' : 'aim'
    if (grip.current === 'aim') aimAt(t)
  }
  const onTableMove = (e: ReactPointerEvent) => {
    const t = toTable(e)
    if (!grip.current || !t || !myTurn) return
    if (grip.current === 'aim') return aimAt(t)
    // the cue points from your finger through the ball
    if (Math.hypot(t.x - cue.x, t.y - cue.y) > R * 2) setAngle(Math.atan2(cue.y - t.y, cue.x - t.x))
  }
  const onTableUp = () => {
    grip.current = null
  }

  // the fine-aim wheel: a slow nudge either way
  const nudge = useRef<number | null>(null)
  const fineDown = (e: ReactPointerEvent) => {
    if (!myTurn) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    nudge.current = e.clientY
  }
  const fineMove = (e: ReactPointerEvent) => {
    if (nudge.current === null) return
    const dy = e.clientY - nudge.current
    nudge.current = e.clientY
    setAngle((a) => a + dy * 0.0015)
  }

  // the power cue beside the table: pull it down, let go to strike (push it back up to call it off)
  const pull = useRef<{ y0: number; h: number; power: number } | null>(null)
  const powerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!myTurn) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pull.current = { y0: e.clientY, h: e.currentTarget.getBoundingClientRect().height, power: 0 }
  }
  const powerMove = (e: ReactPointerEvent) => {
    const p = pull.current
    if (!p) return
    p.power = Math.max(0, Math.min(1, (e.clientY - p.y0) / (p.h * 0.72)))
    setPower(p.power)
  }
  const powerUp = () => {
    const p = pull.current
    pull.current = null
    setPower(0)
    if (p && p.power >= 0.03) shoot(p.power)
  }

  const shoot = (strike: number) => {
    if (!myTurn) return
    const by = live.turn
    const a = angleRef.current
    // the status line keeps names, never 'You': online it's read on both phones
    const said = (k: Seat) => seats[k]?.name ?? (k === 0 ? 'Player 1' : 'Player 2')
    session.move<Live>((cur) => playShot(cur, by, { angle: a, power: strike, spin: spin.y, side: spin.x }, said)).catch(() => {})
  }



  /* ── screens ── */
  const groups = live.groups
  const meta = (s: Seat) => {
    if (!live.broken) return live.breaker === s ? 'Breaks' : 'Table open'
    if (!groups) return 'Table open'
    const n = left(live.pos, groups[s])
    return `${groupName(groups[s])} · ${n ? `${n} left` : 'on the 8'}`
  }
  const card = (s: Seat) => (
    <ScoreCard p={seats[s]} you={mine(s)} active={session.local && !live.result && live.turn === s} turn={!live.result && !rolling && live.turn === s} value={live.scores[`s${s}`]} meta={meta(s)} />
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

  const shooter = live.turn
  const status = rolling
    ? ' '
    : live.result
      ? seriesOver
        ? `${live.result.why} · ${mine(live.result.winner) ? 'you win the match' : `${name(live.result.winner)} wins the match`}`
        : `${live.result.why} · frame ${live.frame + 1} next`
      : !live.broken
        ? `${mine(shooter) ? 'Your' : `${name(shooter)}’s`} break`
        : `${live.says ? `${live.says} · ` : ''}${mine(shooter) ? 'your' : `${name(shooter)}’s`} shot`
  const dir = { x: Math.cos(angle), y: Math.sin(angle) }
  const back = R + 0.012 + power * 0.22

  return (
    <main className="poolm screen-in">
      <div className="mt-hud">
        {card(0)}
        <div className="poolm-frame">
          <span className="label">Frame {live.frame}</span>
          <span className="poolm-to">{seriesLabel(st.target)}</span>
        </div>
        {card(1)}
      </div>

      <div className="poolm-stage">
        {/* what just happened, over the far end of the table for a moment (the cards show whose shot it is) */}
        {status.trim() && (
          <p key={status} className={`poolm-status${myTurn && !session.local ? ' poolm-status--you' : ''}${live.result ? ' poolm-status--stay' : ''}`} role="status">
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </p>
        )}
        <svg
          ref={tableEl}
          className="poolm-table"
          viewBox={`0 0 ${VW} ${VH}`}
          data-ult-board
          aria-label="The pool table"
          onPointerDown={onTableDown}
          onPointerMove={onTableMove}
          onPointerUp={onTableUp}
          onPointerCancel={onTableUp}
        >
          <TableArt />

          {/* where the shot goes: to the first ball (and on from it), or off a cushion */}
          {aimGuide && (
            <g className="poolm-guide" pointerEvents="none">
              <line x1={X(aimGuide.from.x)} y1={Y(aimGuide.from.y)} x2={X(aimGuide.to.x)} y2={Y(aimGuide.to.y)} />
              {aimGuide.hit && (
                <>
                  <circle cx={X(aimGuide.hit.ghost.x)} cy={Y(aimGuide.hit.ghost.y)} r={R * S} className="poolm-ghost" />
                  <line x1={X(live.pos[aimGuide.hit.ball * 2])} y1={Y(live.pos[aimGuide.hit.ball * 2 + 1])} x2={X(aimGuide.hit.object.x)} y2={Y(aimGuide.hit.object.y)} />
                  <line x1={X(aimGuide.hit.ghost.x)} y1={Y(aimGuide.hit.ghost.y)} x2={X(aimGuide.hit.cue.x)} y2={Y(aimGuide.hit.cue.y)} className="poolm-guide__cue" />
                </>
              )}
              {aimGuide.bounce && (
                <>
                  <circle cx={X(aimGuide.to.x)} cy={Y(aimGuide.to.y)} r={R * S} className="poolm-ghost" />
                  <line x1={X(aimGuide.to.x)} y1={Y(aimGuide.to.y)} x2={X(aimGuide.bounce.x)} y2={Y(aimGuide.bounce.y)} className="poolm-guide__cue" />
                </>
              )}
            </g>
          )}

          {Array.from({ length: BALLS }, (_, n) => (
            <g key={n} ref={(el) => void (ballEls.current[n] = el)}>
              <Ball n={n} />
            </g>
          ))}

          {/* the cue: grab it to turn it round the ball; it draws back as you pull the power cue */}
          {myTurn && (
            <g pointerEvents="none">
              <Cue x={cue.x} y={cue.y} dx={dir.x} dy={dir.y} back={back} len={STICK_LEN} />
              <line
                x1={X(cue.x - dir.x * back)}
                y1={Y(cue.y - dir.y * back)}
                x2={X(cue.x - dir.x * (back + STICK_LEN))}
                y2={Y(cue.y - dir.y * (back + STICK_LEN))}
                stroke="transparent"
                strokeWidth="34"
                pointerEvents="stroke"
                className="poolm-grab"
              />
            </g>
          )}
        </svg>

        <div className={`poolm-side${myTurn ? '' : ' poolm-side--off'}`}>
          <div className="poolm-fine" onPointerDown={fineDown} onPointerMove={fineMove} onPointerUp={() => (nudge.current = null)} onPointerCancel={() => (nudge.current = null)} aria-label="Fine aim: slide up or down">
            <span className="poolm-fine__ridges" style={{ backgroundPositionY: `${(angle * 600) % 10}px` }} />
          </div>
          <div
            className="poolm-power"
            onPointerDown={powerDown}
            onPointerMove={powerMove}
            onPointerUp={powerUp}
            onPointerCancel={() => ((pull.current = null), setPower(0))}
            role="slider"
            aria-label="Power: pull the cue down and let go to shoot"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(power * 100)}
          >
            <span className="poolm-power__ticks" aria-hidden="true" />
            <span className="poolm-power__cue" style={{ translate: `0 ${power * 72}%` }} aria-hidden="true" />
            {power > 0 && <span className="poolm-power__value">{Math.round(power * 100)}</span>}
          </div>
          <button
            type="button"
            className="poolm-spin"
            onClick={() => {
              sound('tap')
              setSpinOpen(true)
            }}
            aria-label={`Spin: ${spinWords(spin)} · tap to set it`}
          >
            <svg viewBox="-20 -20 40 40" aria-hidden="true">
              <defs>
                <radialGradient id="pool-spin-gloss" cx="35%" cy="30%" r="75%">
                  <stop offset="0" stopColor="#fff" />
                  <stop offset=".6" stopColor="#e9e6df" />
                  <stop offset="1" stopColor="#9a978f" />
                </radialGradient>
              </defs>
              <circle r="17" fill="url(#pool-spin-gloss)" />
              <circle cx={spin.x * 13} cy={-spin.y * 13} r="3.6" fill="#d42a2a" />
            </svg>
          </button>
        </div>
      </div>
      {spinOpen && <SpinPicker spin={spin} onChange={setSpin} onClose={() => setSpinOpen(false)} />}
    </main>
  )
}

/** what a spin does, in a few words */
const spinWords = ({ x, y }: { x: number; y: number }) => {
  if (Math.hypot(x, y) < 0.12) return 'none'
  const v = y > 0.25 ? 'follow' : y < -0.25 ? 'draw' : ''
  const h = x > 0.25 ? 'right' : x < -0.25 ? 'left' : ''
  return [v, h && `${h} side`].filter(Boolean).join(' and ') || 'a touch off centre'
}

/**
 * The spin picker: a big cue ball over the screen. Drag the red dot to where the cue tip should hit:
 * high to follow through, low to draw back, left or right to bend it off the cushions.
 */
function SpinPicker({ spin, onChange, onClose }: { spin: { x: number; y: number }; onChange: (s: { x: number; y: number }) => void; onClose: () => void }) {
  const { play } = useSound()
  const ball = useRef<SVGSVGElement>(null)
  const held = useRef(false)
  const MAX = 0.8
  const set = (e: ReactPointerEvent) => {
    const box = ball.current?.getBoundingClientRect()
    if (!box) return
    let x = ((e.clientX - box.left) / box.width) * 2 - 1
    let y = -(((e.clientY - box.top) / box.height) * 2 - 1)
    const d = Math.hypot(x, y)
    // the tip can't go right to the edge: it would miscue
    if (d > MAX) (x = (x / d) * MAX), (y = (y / d) * MAX)
    // a hair off the middle counts as the middle
    if (d < 0.08) (x = 0), (y = 0)
    onChange({ x: x / MAX, y: y / MAX })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // on the page itself: the match screen's entrance animation would trap a fixed overlay inside it
  return createPortal(
    <div className="poolm-spinpick" role="dialog" aria-modal="true" aria-label="Spin" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="poolm-spinpick__card">
        <p className="poolm-spinpick__title">Spin · {spinWords(spin)}</p>
        <div className="poolm-spinpick__ball">
          <span className="poolm-spinpick__tag poolm-spinpick__tag--t">Follow</span>
          <span className="poolm-spinpick__tag poolm-spinpick__tag--b">Draw</span>
          <span className="poolm-spinpick__tag poolm-spinpick__tag--l">Left</span>
          <span className="poolm-spinpick__tag poolm-spinpick__tag--r">Right</span>
          <svg
            ref={ball}
            viewBox="-100 -100 200 200"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              held.current = true
              set(e)
            }}
            onPointerMove={(e) => held.current && set(e)}
            onPointerUp={() => (held.current = false)}
            onPointerCancel={() => (held.current = false)}
            aria-label="Drag the red dot to where the cue hits the ball"
          >
            <defs>
              <radialGradient id="pool-pick-gloss" cx="36%" cy="30%" r="78%">
                <stop offset="0" stopColor="#fff" />
                <stop offset=".55" stopColor="#ebe8e1" />
                <stop offset="1" stopColor="#8f8c84" />
              </radialGradient>
            </defs>
            <circle r="96" fill="url(#pool-pick-gloss)" />
            <circle r={96 * MAX} fill="none" stroke="#000" strokeOpacity=".12" strokeDasharray="4 5" />
            <line x1="-96" x2="96" y1="0" y2="0" stroke="#000" strokeOpacity=".14" />
            <line y1="-96" y2="96" x1="0" x2="0" stroke="#000" strokeOpacity=".14" />
            <circle cx={spin.x * MAX * 96} cy={-spin.y * MAX * 96} r="13" fill="#d42a2a" stroke="#7a1414" strokeWidth="2" />
            <circle cx={spin.x * MAX * 96 - 4} cy={-spin.y * MAX * 96 - 4} r="3.5" fill="#fff" opacity=".5" />
          </svg>
        </div>
        <div className="poolm-spinpick__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              play('tap')
              onChange({ x: 0, y: 0 })
            }}
          >
            Centre
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              play('tap')
              onClose()
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── Match results ──────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: PoolState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const s = [st.live.scores.s0, st.live.scores.s1]
  const winner = (s[0] >= st.target ? 0 : 1) as Seat
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
  const oppGone = room.status === 'abandoned' || !opp?.online
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialPoolState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const history = st.live.history ?? []
  const card: CardInput = {
    game: 'Pool',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: 'frames won' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: history.map((h, i) => ({ word: `Frame ${i + 1}`, seat: h.winner, note: h.why })) },
  }

  return (
    <main className="poolm poolm-results screen-in">
      {iWon && <Confetti />}
      <div className="poolm-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Match {st.match} · {seriesLabel(st.target).toLowerCase()}
        </p>
        <h1 className={`poolm-results__title${iWon ? ' poolm-results__title--win' : ''}`}>{iWon && !noYou ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}</h1>
        <p className="poolm-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
        {history.length > 0 && (
          <ol className="poolm-results__frames">
            {history.map((h, i) => (
              <li key={i}>
                Frame {i + 1}: {h.why}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={!noYou && me.seat === 0} value={s[0]} meta="Frames" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!noYou && me.seat === 1} value={s[1]} meta="Frames" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Pool', GAME, names, winner, scoreLine)}
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
