import { useEffect, useRef } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ShareResult } from '../../match/ShareResult'
import type { CardInput } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { Mark, TttBoard } from './Board'
import { MARK, RESULT_MS, freshLive, next, play, type Live } from './engine'
import '../../styles/tictactoe.css'

const GAME = 'tictactoe'

export interface TttState {
  /** games needed to win the series (best of 3 → 2) */
  target: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialTttState(target = 2, match = 1): TttState {
  // the opener of game 1 alternates between matches
  const starter = (match % 2 === 1 ? 0 : 1) as Seat
  return { target, match, live: freshLive(starter, 1) }
}

export function TttMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as TttState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  // "you" only means something online; on a shared device the cards follow whose turn it is
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const score = (s: Seat) => live.scores[`s${s}`]

  const seriesOver = score(0) >= st.target || score(1) >= st.target
  // the deciding board (and its strike) stays up for a beat before the results take over
  const showResults = useHold(seriesOver, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !seriesOver

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  const myTurn = inMatch && !live.result && live.turn === me.seat

  const tap = (cell: number) => {
    if (!myTurn || live.board[cell] !== '.') return
    sound('tap')
    session.move<Live>((cur) => play(cur, me.seat, cell)).catch(() => {})
  }

  // a finished game: pause, then either player deals the next board (the transaction makes it happen once)
  useEffect(() => {
    if (!live.result || seriesOver || abandoned) return
    const finished = live.game
    const t = setTimeout(() => {
      session.move<Live>((cur) => next(cur, finished)).catch(() => {})
    }, RESULT_MS)
    return () => clearTimeout(t)
  }, [session, live.result, live.game, seriesOver, abandoned])

  // sounds: opponent's move, and how each game ends
  const seenRef = useRef({ last: live.last, game: live.game, result: !!live.result })
  useEffect(() => {
    const seen = seenRef.current
    if (live.last !== seen.last && live.last >= 0 && !session.local && live.board[live.last] !== String(me.seat)) sound('tick')
    if (live.result && !seen.result) {
      const w = live.result.winner
      sound((session.local ? w !== -1 : w === me.seat) ? 'findBig' : w === -1 ? 'join' : 'end')
    }
    seenRef.current = { last: live.last, game: live.game, result: !!live.result }
  }, [live.last, live.game, live.result, live.board, me.seat, sound, session.local])

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${MARK[0]} · first to ${st.target}`} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${MARK[1]} · first to ${st.target}`} />
    </>
  )

  if (abandoned && !seriesOver) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  }
  if (showResults) {
    return <Results room={room} me={me} st={st} seats={seats} exit={exit} />
  }

  const mover = seats[live.turn]
  const status = live.result
    ? seriesOver && live.result.winner !== -1
      ? mine(live.result.winner)
        ? 'You win the match'
        : `${seats[live.result.winner]?.name ?? 'They'} wins the match`
      : live.result.winner === -1
      ? `Draw — game ${live.game + 1} next`
      : `${mine(live.result.winner) ? 'You take' : `${seats[live.result.winner]?.name ?? 'They'} takes`} game ${live.game}`
    : myTurn && !session.local
      ? 'Your turn'
      : `${mover?.name ?? 'Opponent'}’s turn`

  return (
    <main className="ttt screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${MARK[0]} · first to ${st.target}`} />
        <div className={`ttt-turn ttt-turn--${live.result ? 'done' : live.turn}${myTurn ? ' ttt-turn--you' : ''}`} aria-live="polite">
          <span className="label">Game {live.game}</span>
          <Mark seat={live.result ? (live.result.winner === -1 ? null : live.result.winner) : live.turn} small />
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${MARK[1]} · first to ${st.target}`} />
      </div>

      <p className={`ttt-status${myTurn ? ' ttt-status--you' : ''}${live.result ? ' ttt-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="ttt-stage">
        <TttBoard live={live} mySeat={me.seat} myTurn={myTurn} onTap={tap} />
      </div>

      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── Series results ──────────────────────────────────────────────────── */

function Results({
  room,
  me,
  st,
  seats,
  exit,
}: {
  room: Room
  me: Me
  st: TttState
  seats: [Seated | null, Seated | null]
  exit: MatchExit
}) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const s = [st.live.scores.s0, st.live.scores.s1]
  const winner = (s[0] >= st.target ? 0 : 1) as Seat
  // on one device the winner is whoever won — there's no "you" to compare against
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
  const over = room.status === 'abandoned'
  const oppGone = over || !opp?.online

  // host resets the series once both are ready (same length, next match number)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialTttState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Tic-Tac-Toe',
    winner,
    scoreLine,
    link: shareLink(GAME),
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${MARK[k]} · games won` })) as CardInput['players'],
    detail: {
      kind: 'ttt',
      board: st.live.board,
      line: st.live.result?.line,
      stats: [['Series', `Best of ${st.target * 2 - 1}`], ['Games played', String(st.live.game)]],
    },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="ttt ttt-results screen-in">
      {iWon && <Confetti />}
      <div className="ttt-results__head">
        <p className="label">
          Match {st.match} · first to {st.target}
        </p>
        <h1 className={`ttt-results__title${iWon ? ' ttt-results__title--win' : ''}`}>
          {iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="ttt-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
      </div>
      <div className="mt-hud ttt-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={MARK[0]} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={MARK[1]} />
      </div>
      <div className="mt-share">
        <ShareResult card={card} won={iWon} message={shareMessage('Tic-Tac-Toe', GAME, names, winner, scoreLine)} />
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
                : 'Play again'}
          <span className="keycap">↵</span>
        </button>
        <button type="button" className="btn" onClick={over || session.local ? exit.now : exit.request}>
          {over || session.local ? 'Back to lobby' : 'Leave room'}
        </button>
      </div>
    </main>
  )
}
