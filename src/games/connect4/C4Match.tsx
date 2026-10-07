import { useEffect, useRef } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ShareResult } from '../../match/ShareResult'
import { VsBlock } from '../../components/VsBlock'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalry } from '../../match/useRivalry'
import type { CardInput } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { C4Board, Disc } from './Board'
import { RESULT_MS, dropRow, freshLive, next, play, type Live } from './engine'
import '../../styles/connect4.css'

const GAME = 'connect4'
const COLOUR = ['Orange', 'Blue'] as const
/** "Single game" / "Best of 3" from the number of wins needed */
export const seriesLabel = (target: number) => (target === 1 ? 'Single game' : `Best of ${target * 2 - 1}`)

export interface C4State {
  /** games needed to win the series (single game → 1, best of 3 → 2) */
  target: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialC4State(target = 2, match = 1): C4State {
  // the opener of game 1 alternates between matches
  const starter = (match % 2 === 1 ? 0 : 1) as Seat
  return { target, match, live: freshLive(starter, 1) }
}

export function C4Match({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as C4State
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

  const drop = (col: number) => {
    if (!myTurn || dropRow(live.board, col) < 0) return
    sound('tap')
    session.move<Live>((cur) => play(cur, me.seat, col)).catch(() => {})
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
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · first to ${st.target}`} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · first to ${st.target}`} />
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
    <main className="c4m screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · first to ${st.target}`} />
        <div className={`c4-turn${myTurn ? ' c4-turn--you' : ''}`} aria-live="polite">
          <span className="label">Game {live.game}</span>
          <Disc seat={live.result ? (live.result.winner === -1 ? null : live.result.winner) : live.turn} />
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · first to ${st.target}`} />
      </div>

      <p className={`c4-status${myTurn ? ' c4-status--you' : ''}${live.result ? ' c4-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="c4-stage">
        <C4Board live={live} mySeat={me.seat} myTurn={myTurn} onDrop={drop} />
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
  st: C4State
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
    session.start({ ...initialC4State(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Connect Four',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${COLOUR[k]} · games won` })) as CardInput['players'],
    detail: {
      kind: 'c4',
      board: st.live.board,
      line: st.live.result?.line,
      stats: [['Series', seriesLabel(st.target)], ['Games played', String(st.live.game)]],
    },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="c4m c4m-results screen-in">
      {iWon && <Confetti />}
      <div className="c4m-results__head">
        <VsBlock mood="win" side={winner} eyes size={64} />
        <p className="label">
          Match {st.match} · {seriesLabel(st.target).toLowerCase()}
        </p>
        <h1 className={`c4m-results__title${iWon ? ' c4m-results__title--win' : ''}`}>
          {iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="c4m-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
      </div>
      <div className="mt-hud c4m-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={COLOUR[0]} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={COLOUR[1]} />
      </div>
      <RivalryLine r={rivalry} />
      <div className="mt-share">
        <ShareResult card={card} won={iWon} message={shareMessage('Connect Four', GAME, names, winner, scoreLine)} />
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
