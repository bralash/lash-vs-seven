import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useServerOffset } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { Countdown } from '../../match/Countdown'
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
import { Board } from './Board'
import { OPS_THINK, opsLine } from './bot'
import {
  HUES,
  MS_PER_MOVE,
  encode,
  freshLive,
  loopAt,
  movesOf,
  outcome,
  playFrom,
  playTo,
  replay,
  settle,
  valid,
  type DotLive,
  type Seat,
} from './engine'
import { dotrushFeats } from './feats'
import '../../styles/dotrush.css'

const GAME = 'dotrush'
/** how long the "GO!" beat stays up */
const GO_MS = 650

export interface DotRushState {
  /** moves each, per game */
  moves: number
  match: number
  live: DotLive
  ready?: Record<string, boolean>
}

export const initialDotRushState = (moves = 30, match = 1): DotRushState => ({ moves, match, live: freshLive(moves) })

const key = (s: Seat) => (s === 0 ? 's0' : 's1')
const withMoves = (cur: DotLive, s: Seat, list: string[]): DotLive | undefined =>
  cur.result ? undefined : { ...cur, m: { ...cur.m, [key(s)]: list } }

interface Said {
  text: string
  big: boolean
  n: number
}

export function DotRushMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as DotRushState
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

  const offset = useServerOffset()
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const now = useCallback(() => Date.now() + offsetRef.current, [])
  const [t, setT] = useState(now)
  useEffect(() => {
    const id = setInterval(() => setT(now()), 100)
    return () => clearInterval(id)
  }, [now])

  const over = !!live.result
  const showResults = useHold(over, 1400)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, online ? opp : null, inMatch)

  // the host (or this phone, against Ops) sets the game going
  useEffect(() => {
    if (live.start || over || !(me.isHost || vsOps)) return
    session.move<DotLive>((cur) => (cur.start || cur.result ? undefined : { ...cur, start: now() })).catch(() => {})
  }, [live.start, over, me.isHost, vsOps, session, now])

  // your moves are kept here as you make them (instant), and sent to the room
  const [myMoves, setMyMoves] = useState<string[]>(() => movesOf(live, mine))
  const seedRef = useRef(live.seed)
  useEffect(() => {
    if (seedRef.current === live.seed) return
    seedRef.current = live.seed
    setMyMoves(movesOf(live, mine))
    window.scrollTo(0, 0)
  }, [live, mine])
  const myPlay = useMemo(() => replay(live.seed, myMoves), [live.seed, myMoves])
  const theirMoves = movesOf(live, theirs)
  const theirPlay = useMemo(() => replay(live.seed, theirMoves), [live.seed, theirMoves.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const phase: 'wait' | 'countdown' | 'play' | 'grace' = !live.start ? 'wait' : t < playFrom(live) ? 'countdown' : t < playTo(live) ? 'play' : 'grace'
  const myLeft = live.moves - myPlay.used
  const canPlay = phase === 'play' && myLeft > 0 && !over

  const [drag, setDrag] = useState<number[]>([])
  const [said, setSaid] = useState<Said | null>(null)
  const say = (text: string, big = false) => {
    const n = Date.now()
    setSaid({ text, big, n })
    setTimeout(() => setSaid((x) => (x?.n === n ? null : x)), 1100)
  }

  const onLine = (path: number[]) => {
    if (!canPlay || !valid(myPlay.board.dots, path)) return
    const took = outcome(myPlay.board.dots, path)
    const next = [...myMoves, encode(path)]
    setMyMoves(next)
    session.move<DotLive>((cur) => withMoves(cur, mine, next)).catch(() => {})
    const n = took.gone.length
    if (took.bombs.length) {
      sound('boom')
      say(`Bomb! +${n}`, true)
    } else if (took.loop) {
      sound('findBig')
      say(`Loop +${n}`, true)
    } else {
      sound('find')
      say(`+${n}`)
    }
  }

  // Ops plays her own copy of the board, a line every few seconds
  const opsMoves = useRef<string[]>([])
  useEffect(() => {
    opsMoves.current = vsOps ? movesOf(live, 1) : []
  }, [vsOps, live.seed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!vsOps || !live.start || over) return
    let timer = 0
    const go = () => {
      const [lo, hi] = OPS_THINK[level]
      const wait = Math.max(0, playFrom(live) - now()) + lo + Math.random() * (hi - lo)
      timer = window.setTimeout(() => {
        const list = opsMoves.current
        if (list.length >= live.moves || now() >= playTo(live)) return
        const board = replay(live.seed, list).board
        const line = opsLine(board.dots, level)
        if (line.length < 2) return
        const next = [...list, encode(line)]
        opsMoves.current = next
        session.move<DotLive>((cur) => withMoves(cur, 1, next)).catch(() => {})
        go()
      }, wait)
    }
    go()
    return () => clearTimeout(timer)
  }, [vsOps, live.start, live.seed, over, level, session, now]) // eslint-disable-line react-hooks/exhaustive-deps

  // both done, or the clock's out: settle it (any phone can; only the first one lands)
  const settling = useRef('')
  useEffect(() => {
    if (over || !live.start) return
    const tag = `${live.seed}`
    if (settling.current === tag) return
    if (!settle(live, t)) return
    settling.current = tag
    session.move<DotLive>((cur) => settle(cur, now())).then((ok) => {
      if (!ok) settling.current = ''
    }, () => (settling.current = ''))
  }, [live, t, over, session, now])

  // sounds: the countdown, the go, the last ten seconds
  const secsLeft = Math.max(0, Math.ceil((playTo(live) - t) / 1000))
  const count = Math.max(1, Math.ceil((playFrom(live) - t) / 1000))
  const beat = useRef('')
  useEffect(() => {
    const b = phase === 'countdown' ? `c${count}` : phase === 'play' ? `p${secsLeft}` : phase
    if (b === beat.current) return
    const prev = beat.current
    beat.current = b
    if (!prev) return
    if (phase === 'countdown') sound('tick')
    else if (phase === 'play' && prev.startsWith('c')) sound('start')
    else if (phase === 'play' && secsLeft <= 10 && myLeft > 0) sound('tick')
    else if (phase === 'grace') sound('end')
  }, [phase, count, secsLeft, myLeft, sound])

  /* ── screens ── */

  const playOf = (s: Seat) => (s === mine ? myPlay : theirPlay)
  const card = (s: Seat) => {
    const p = playOf(s)
    const left = live.moves - p.used
    return <ScoreCard p={seats[s]} you={s === mine} score={p.score} value={p.score} meta={left > 0 ? `${left} moves left` : 'done'} />
  }
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

  const total = live.moves * MS_PER_MOVE
  const pct = phase === 'play' ? ((playTo(live) - t) / total) * 100 : phase === 'grace' ? 0 : 100
  const hot = phase === 'play' && secsLeft <= 10
  const k = loopAt(drag)
  const dragTake = drag.length >= 2 && valid(myPlay.board.dots, drag) ? outcome(myPlay.board.dots, drag) : null

  let line: ReactNode
  if (dragTake)
    line = (
      <span className="dr-say__drag" style={{ ['--c' as string]: HUES[myPlay.board.dots[drag[0]].c] }}>
        {dragTake.bombs.length ? 'Bomb' : k >= 0 ? 'Loop' : `${drag.length} dots`}
        <b>+{dragTake.gone.length}</b>
      </span>
    )
  else if (said) line = <span key={said.n} className={`dr-say__took${said.big ? ' dr-say__took--big' : ''}`}>{said.text}</span>
  else if (phase === 'wait' || phase === 'countdown') line = <span className="dr-say__hint">Get ready</span>
  else if (over || phase === 'grace') line = <span className="dr-say__hint">Time!</span>
  else if (myLeft <= 0) line = <span className="dr-say__hint">Out of moves · {theirPlay.used < live.moves ? `${oppName} is still going` : 'counting up'}</span>
  else line = <span className="dr-say__hint">Join one colour · loop for all</span>

  return (
    <main className="dr screen-in">
      <div className="mt-hud">
        {card(0)}
        <div className={`mt-clock${hot ? ' mt-clock--hot' : ''}`} role="timer" aria-live="off">
          <span className="label">Moves</span>
          <span className="mt-clock__n">{myLeft}</span>
        </div>
        {card(1)}
      </div>
      <div className="mt-timebar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} className={hot ? 'hot' : ''} />
      </div>
      <div className={`dr-say${dragTake ? ' dr-say--drag' : ''}`} aria-live="polite">
        {line}
      </div>
      <div className="dr-stage">
        <Board dots={myPlay.board.dots} hidden={phase === 'wait' || phase === 'countdown'} disabled={!canPlay} onPathChange={setDrag} onLine={onLine} />
      </div>
      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
      {(phase === 'countdown' || (phase === 'play' && t - playFrom(live) < GO_MS)) && (
        <Countdown
          label={`Game ${st.match}`}
          n={phase === 'countdown' ? count : 0}
          names={[seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Ops']}
          subtitle={`Same dots · ${live.moves} moves each · most dots wins`}
        />
      )}
    </main>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: DotRushState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const l = st.live
  const winner = l.result?.winner ?? -1
  const iWon = winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const plays = useMemo(() => ([0, 1] as Seat[]).map((s) => replay(l.seed, movesOf(l, s).slice(0, l.moves))), [l])

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
    session.start({ ...initialDotRushState(st.moves, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.moves, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'You', seats[1]?.name ?? 'Ops']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match, dotrushFeats(l))
  const scores = l.result?.scores ?? [plays[0].score, plays[1].score]
  const scoreLine = `${scores[0]} — ${scores[1]}`
  const note = (s: Seat) => {
    const p = plays[s]
    const bits = [`best line ${p.best}`, `${p.loops} ${p.loops === 1 ? 'loop' : 'loops'}`]
    if (p.bombs) bits.push(`${p.bombs} ${p.bombs === 1 ? 'bomb' : 'bombs'}`)
    return bits.join(' · ')
  }
  const card: CardInput = {
    game: 'Dot Rush',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((s) => ({ name: names[s], seat: s as Seat, score: String(scores[s]), meta: 'dots' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: ([0, 1] as Seat[]).map((s) => ({ word: names[s], seat: s, note: note(s) })) },
  }
  const headline = winner === -1 ? 'Draw' : iWon ? 'You win' : `${names[winner]} wins`

  return (
    <main className="dr dr-results screen-in">
      {iWon && <Confetti />}
      <div className="dr-results__head">
        <ResultMark winner={winner} />
        <p className="label">
          Game {st.match} · {st.moves} moves each
        </p>
        <h1 className={`dr-results__title${iWon ? ' dr-results__title--win' : ''}`}>{headline}</h1>
        <p className="dr-results__line">
          {scores[0]} <span>—</span> {scores[1]}
        </p>
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={scores[0]} meta={note(0)} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={scores[1]} meta={note(1)} />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Dot Rush', GAME, names, winner, scoreLine)}
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
