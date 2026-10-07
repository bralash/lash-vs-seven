import { ref, set } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../lib/firebase'
import { useServerNow } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, roomPath, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { Countdown } from '../../match/Countdown'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import { ShareResult } from '../../match/ShareResult'
import type { CardInput } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { NumberPad, SudokuBoard } from './Board'
import { COUNTDOWN_MS, DIFFICULTY_LABEL, RESULT_MS, clock, generate, isSolved, type Difficulty } from './engine'
import { useSudokuInput } from './useSudokuInput'
import '../../styles/sudoku.css'

const GAME = 'sudoku'
/** "Go!" stays up this long after the countdown */
const GO_MS = 600

/** Pass-and-play: one player solves while the other waits, then they swap. */
interface LocalLive {
  turn: Seat
  phase: 'ready' | 'solving' | 'done'
  /** when the current player tapped Start (device clock) */
  startAt?: number
  times?: { s0?: number; s1?: number }
}

export interface SudokuState {
  difficulty: Difficulty
  match: number
  puzzle: string
  solution: string
  /** online: cells each player has filled, for the opponent's progress bar */
  progress?: Record<string, number>
  /** online: the first finisher claims this (create-only in the rules, so exactly one winner) */
  solved?: { win?: { by: string; ms: number } }
  ready?: Record<string, boolean>
  live: LocalLive
}

export function initialSudokuState(difficulty: Difficulty = 'medium', match = 1): SudokuState {
  const { puzzle, solution } = generate(difficulty)
  // in pass-and-play, who goes first alternates between matches
  const turn = (match % 2 === 1 ? 0 : 1) as Seat
  return { difficulty, match, puzzle, solution, live: { turn, phase: 'ready' } }
}

const empties = (puzzle: string) => puzzle.split('').filter((v) => v === '.').length
const filled = (grid: string, puzzle: string) => grid.split('').filter((v, i) => v !== '.' && puzzle[i] === '.').length

export function SudokuMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const session = useSession(GAME, room.code)
  return session.local ? <LocalSudoku room={room} me={me} exit={exit} /> : <OnlineSudoku room={room} me={me} exit={exit} />
}

/* ── Online: a race on the same puzzle ─────────────────────────────── */

function OnlineSudoku({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as SudokuState
  const now = useServerNow(250)
  const { play: sound } = useSound()
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const path = roomPath(GAME, room.code)

  const playFrom = (room.startedAt ?? now) + COUNTDOWN_MS
  const win = st.solved?.win
  const phase: 'countdown' | 'play' | 'over' = win ? 'over' : now < playFrom ? 'countdown' : 'play'
  const showResults = useHold(!!win, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inRace = !abandoned && phase !== 'over'

  useBeforeUnload(inRace)
  useScrollLock(inRace)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inRace)

  const input = useSudokuInput(st.puzzle, `lvs_sudoku:${room.code}:${st.match}`, phase === 'play' && !abandoned)
  const need = empties(st.puzzle)
  const mineFilled = filled(input.grid, st.puzzle)

  // mirror how far along I am, so the opponent sees a progress bar (count only, never the digits)
  useEffect(() => {
    if (phase !== 'play') return
    set(ref(db, `${path}/state/progress/${me.id}`), mineFilled).catch(() => {})
  }, [mineFilled, phase, path, me.id])

  // finished: claim the win (the rules let only the first claim land)
  const claimed = useRef(false)
  useEffect(() => {
    if (phase !== 'play' || claimed.current || !isSolved(input.grid)) return
    claimed.current = true
    set(ref(db, `${path}/state/solved/win`), { by: me.id, ms: Math.max(0, now - playFrom) }).catch(() => {})
  }, [phase, input.grid, path, me.id, now, playFrom])

  // sounds: countdown ticks, go, and the finish
  const countdown = Math.max(1, Math.ceil((playFrom - now) / 1000))
  const beatRef = useRef('')
  useEffect(() => {
    const beat = phase === 'countdown' ? `c${countdown}` : phase
    if (beat === beatRef.current) return
    const prev = beatRef.current
    beatRef.current = beat
    if (!prev) return
    if (phase === 'countdown') sound('tick')
    else if (phase === 'play') sound('start')
    else if (phase === 'over') sound(win?.by === me.id ? 'findBig' : 'end')
  }, [phase, countdown, win, me.id, sound])

  const oppFilled = (opp && st.progress?.[opp.id]) || 0
  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={me.seat === 0} value={`${me.seat === 0 ? mineFilled : oppFilled}/${need}`} meta="filled" />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={me.seat === 1} value={`${me.seat === 1 ? mineFilled : oppFilled}/${need}`} meta="filled" />
    </>
  )

  if (abandoned && !win) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults && win) {
    const winner = (win.by === seats[0]?.id ? 0 : 1) as Seat
    const loser = (1 - winner) as Seat
    const loserFilled = loser === me.seat ? mineFilled : oppFilled
    return (
      <Results
        room={room}
        me={me}
        st={st}
        seats={seats}
        exit={exit}
        winner={winner}
        values={winner === 0 ? [clock(win.ms), `${loserFilled}/${need}`] : [`${loserFilled}/${need}`, clock(win.ms)]}
        metas={winner === 0 ? ['solved', 'filled'] : ['filled', 'solved']}
        headline={`${seats[winner]?.name ?? 'They'} solved it in ${clock(win.ms)}`}
        cardLine={`Solved in ${clock(win.ms)}`}
        brag={`by solving it in ${clock(win.ms)}`}
        stats={[['Time', clock(win.ms)], ['Difficulty', DIFFICULTY_LABEL[st.difficulty]]]}
      />
    )
  }

  const elapsed = phase === 'play' ? now - playFrom : 0
  const bar = (p: Seated | null, n: number) => (
    <div className={`su-race su-race--${p?.seat ?? 0}${p?.id === me.id ? ' su-race--you' : ''}`}>
      <span className="su-race__name">{p?.name ?? '—'}{p?.id === me.id ? ' · you' : ''}</span>
      <span className="su-race__track" aria-hidden="true">
        <span className="su-race__fill" style={{ width: `${(n / need) * 100}%` }} />
      </span>
      <span className="su-race__n">{n}/{need}</span>
    </div>
  )

  return (
    <main className="sum screen-in">
      <div className="su-hud">
        <div className="su-hud__bars">
          {bar(seats[0], me.seat === 0 ? mineFilled : oppFilled)}
          {bar(seats[1], me.seat === 1 ? mineFilled : oppFilled)}
        </div>
        <div className="su-clock" aria-label={`Time ${clock(elapsed)}`}>
          <span className="label">{DIFFICULTY_LABEL[st.difficulty]}</span>
          <span className="su-clock__t">{clock(elapsed)}</span>
        </div>
      </div>

      <Play input={input} puzzle={st.puzzle} seat={me.seat} locked={phase !== 'play'} sound={sound} />

      {phase === 'over' && (
        <p className="su-banner" role="status">
          {win?.by === me.id ? 'Solved! You win' : `${seats.find((p) => p?.id === win?.by)?.name ?? 'They'} solved it first`}
        </p>
      )}
      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
      {(phase === 'countdown' || (phase === 'play' && now - playFrom < GO_MS)) && (
        <Countdown
          label={`Match ${st.match} · ${DIFFICULTY_LABEL[st.difficulty]}`}
          n={phase === 'countdown' ? countdown : 0}
          names={[seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']}
          subtitle="Same puzzle · first to solve it wins"
        />
      )}
    </main>
  )
}

/* ── Pass & play: same puzzle, one after the other, fastest time wins ── */

function LocalSudoku({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as SudokuState
  const live = st.live
  const session = useSession(GAME, room.code)
  const { play: sound } = useSound()
  const seats = playersBySeat(room)
  const times = live.times ?? {}
  const turn = live.turn
  const first = (st.match % 2 === 1 ? 0 : 1) as Seat
  const done = live.phase === 'done'
  const showResults = useHold(done, RESULT_MS)
  const solving = live.phase === 'solving'

  // both players share this device, so its own clock times each run
  const local = useNow(250)

  useBeforeUnload(!done)
  useScrollLock(!done)

  const input = useSudokuInput(st.puzzle, `lvs_sudoku:local:${st.match}:${turn}`, solving)

  // finished my run: record the time, then hand over (or end)
  useEffect(() => {
    if (!solving || !isSolved(input.grid)) return
    const ms = Math.max(0, Date.now() - (live.startAt ?? Date.now()))
    sound('findBig')
    session.move<LocalLive>((cur) =>
      cur.phase !== 'solving' || cur.turn !== turn
        ? undefined
        : {
            turn: turn === first ? ((1 - turn) as Seat) : turn,
            phase: turn === first ? 'ready' : 'done',
            times: { ...(cur.times ?? {}), [`s${turn}`]: ms },
          },
    )
  }, [solving, input.grid, live.startAt, turn, first, session, sound])

  const start = () => {
    sound('start')
    session.move<LocalLive>((cur) => (cur.phase === 'ready' ? { ...cur, phase: 'solving', startAt: Date.now() } : undefined))
  }

  if (showResults) {
    const t0 = times.s0 ?? 0
    const t1 = times.s1 ?? 0
    const winner = (t0 === t1 ? -1 : t0 < t1 ? 0 : 1) as Seat | -1
    const gap = Math.abs(t0 - t1)
    return (
      <Results
        room={room}
        me={me}
        st={st}
        seats={seats}
        exit={exit}
        winner={winner}
        values={[clock(t0), clock(t1)]}
        metas={['time', 'time']}
        headline={winner === -1 ? 'Exactly the same time' : `Faster by ${clock(gap)}`}
        cardLine={winner === -1 ? `Both in ${clock(t0)}` : `Faster by ${clock(gap)}`}
        brag={winner === -1 ? `at ${clock(t0)} each` : `by ${clock(gap)}`}
        stats={[['Time', clock(Math.min(t0, t1))], ['Difficulty', DIFFICULTY_LABEL[st.difficulty]]]}
      />
    )
  }

  const player = seats[turn]
  const other = seats[(1 - turn) as Seat]
  const firstTime = times[`s${first}`]

  if (live.phase === 'ready') {
    return (
      <main className="sum su-handoff screen-in">
        <div className="su-handoff__card">
          {firstTime !== undefined && other && (
            <p className="label">
              {other.name} solved it in {clock(firstTime)}
            </p>
          )}
          <h1 className={`su-handoff__name su-handoff__name--${turn}`}>{player?.name ?? `Player ${turn + 1}`}</h1>
          <p className="su-handoff__line">
            {firstTime === undefined
              ? `You’re up first. ${other?.name ?? 'Your opponent'} looks away — no peeking.`
              : `Same puzzle. Beat ${clock(firstTime)}.`}
          </p>
          <p className="hint">
            {DIFFICULTY_LABEL[st.difficulty]} · {empties(st.puzzle)} squares to fill · the clock starts when you tap
          </p>
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
            Start the clock <span className="keycap">↵</span>
          </button>
        </div>
      </main>
    )
  }

  const elapsed = solving ? local - (live.startAt ?? local) : 0
  const need = empties(st.puzzle)

  return (
    <main className="sum screen-in">
      <div className="su-hud">
        <div className="su-hud__bars">
          <div className={`su-race su-race--${turn} su-race--you`}>
            <span className="su-race__name">{player?.name}</span>
            <span className="su-race__track" aria-hidden="true">
              <span className="su-race__fill" style={{ width: `${(filled(input.grid, st.puzzle) / need) * 100}%` }} />
            </span>
            <span className="su-race__n">
              {filled(input.grid, st.puzzle)}/{need}
            </span>
          </div>
          {firstTime !== undefined && other && (
            <p className="su-target">
              {other.name}: <b>{clock(firstTime)}</b>
            </p>
          )}
        </div>
        <div className={`su-clock${firstTime !== undefined && elapsed > firstTime ? ' su-clock--behind' : ''}`} aria-label={`Time ${clock(elapsed)}`}>
          <span className="label">{DIFFICULTY_LABEL[st.difficulty]}</span>
          <span className="su-clock__t">{clock(elapsed)}</span>
        </div>
      </div>

      <Play input={input} puzzle={st.puzzle} seat={turn} locked={!solving} sound={sound} />
    </main>
  )
}

/** Re-renders every `ms` and returns the device time. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/* ── Board + pad, shared by both modes ─────────────────────────────── */

function Play({
  input,
  puzzle,
  seat,
  locked,
  sound,
}: {
  input: ReturnType<typeof useSudokuInput>
  puzzle: string
  seat: Seat
  locked: boolean
  sound: (cue: 'tap' | 'tick' | 'error') => void
}) {
  const digit = (d: number) => {
    if (locked || input.selected < 0 || puzzle[input.selected] !== '.') return
    input.enter(d)
    sound('tap')
  }
  return (
    <div className="su-play">
      <SudokuBoard
        puzzle={puzzle}
        grid={input.grid}
        notes={input.notes}
        selected={input.selected}
        clashes={input.clashes}
        seat={seat}
        locked={locked}
        onSelect={input.setSelected}
      />
      <NumberPad
        counts={input.counts}
        notesMode={input.notesMode}
        seat={seat}
        disabled={locked}
        onDigit={digit}
        onErase={() => digit(0)}
        onToggleNotes={() => input.setNotesMode((m) => !m)}
      />
    </div>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({
  room,
  me,
  st,
  seats,
  exit,
  winner,
  values,
  metas,
  headline,
  cardLine,
  brag,
  stats,
}: {
  room: Room
  me: Me
  st: SudokuState
  seats: [Seated | null, Seated | null]
  exit: MatchExit
  winner: Seat | -1
  values: [string, string]
  metas: [string, string]
  headline: string
  /** the share card's line under the winner, e.g. "Solved in 6:42" */
  cardLine: string
  /** the result as it reads in the share message: "Seven beat Emmanuel {brag} at Sudoku" */
  brag: string
  stats: [string, string][]
}) {
  const session = useSession(GAME, room.code)
  const { play: sound } = useSound()
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])
  const over = room.status === 'abandoned'
  const oppGone = over || !opp?.online

  // host deals a fresh puzzle (same difficulty) once both are ready
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialSudokuState(st.difficulty, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.difficulty, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const scoreLine = `${values[0]} — ${values[1]}`
  const card: CardInput = {
    game: 'Sudoku',
    winner,
    scoreLine,
    headline: cardLine.toUpperCase(),
    link: shareLink(GAME),
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: values[k], meta: metas[k] })) as CardInput['players'],
    detail: { kind: 'sudoku', puzzle: st.puzzle, solution: st.solution, seat: winner === -1 ? 0 : winner, stats },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="sum sum-results screen-in">
      {iWon && <Confetti />}
      <div className="sum-results__head">
        <p className="label">
          Match {st.match} · {DIFFICULTY_LABEL[st.difficulty]}
        </p>
        <h1 className={`sum-results__title${iWon ? ' sum-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="sum-results__line">{headline}</p>
      </div>
      <div className="mt-hud sum-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={values[0]} meta={metas[0]} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={values[1]} meta={metas[1]} />
      </div>
      <div className="mt-share">
        <ShareResult card={card} won={iWon} message={shareMessage('Sudoku', GAME, names, winner, brag)} />
      </div>

      <div className="mt-actions" aria-live="polite">
        <button type="button" className="btn btn--primary btn--lg" onClick={readyUp} disabled={imReady || oppGone}>
          {oppGone
            ? `${opp?.name ?? 'Opponent'} left`
            : imReady
              ? oppReady
                ? 'Dealing…'
                : 'Ready — waiting'
              : oppReady
                ? `Rematch — ${opp?.name} is ready`
                : 'New puzzle'}
          <span className="keycap">↵</span>
        </button>
        <button type="button" className="btn" onClick={over || session.local ? exit.now : exit.request}>
          {over || session.local ? 'Back to lobby' : 'Leave room'}
        </button>
      </div>
    </main>
  )
}
