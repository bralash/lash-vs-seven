import { useEffect, useRef } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalry } from '../../match/useRivalry'
import type { CardInput } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { Disc, OthelloBoard } from './Board'
import { RESULT_MS, count, flips, freshLive, play, type Live } from './engine'
import '../../styles/othello.css'

const GAME = 'othello'
const COLOUR = ['Orange', 'Blue'] as const

export interface OthelloState {
  /** show legal moves on the board */
  hints: boolean
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialOthelloState(hints = true, match = 1): OthelloState {
  // whoever moves first alternates between matches
  const starter = (match % 2 === 1 ? 0 : 1) as Seat
  return { hints, match, live: freshLive(starter) }
}

/** "7 discs" between the two counts, or "Level" */
export const margin = (a: number, b: number) => (a === b ? 'Level' : `${Math.abs(a - b)} disc${Math.abs(a - b) === 1 ? '' : 's'}`)

export function OthelloMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as OthelloState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  // "you" only means something online; on a shared device the cards follow whose turn it is
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const score = (s: Seat) => count(live.board, s)
  const empty = live.board.split('').filter((v) => v === '.').length

  const over = !!live.result
  // the final board (and its last flips) stays up for a beat before the results take over
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  const myTurn = inMatch && live.turn === me.seat

  const place = (cell: number) => {
    if (!myTurn || !flips(live.board, me.seat, cell).length) return
    sound('tap')
    session.move<Live>((cur) => play(cur, me.seat, cell)).catch(() => {})
  }

  // sounds: opponent's move, being skipped, and how the game ends
  const seenRef = useRef({ last: live.last, result: over })
  useEffect(() => {
    const seen = seenRef.current
    if (live.last !== seen.last && live.last >= 0) {
      const byMe = session.local || live.board[live.last] === String(me.seat)
      if (!byMe) sound('tick')
      // a big capture (5+) gets a little fanfare for whoever made it
      else if ((live.flipped?.length ?? 0) >= 5) sound('find')
    }
    if (live.result && !seen.result) {
      const w = live.result.winner
      sound((session.local ? w !== -1 : w === me.seat) ? 'findBig' : w === -1 ? 'join' : 'end')
    }
    seenRef.current = { last: live.last, result: !!live.result }
  }, [live.last, live.board, live.flipped, live.result, me.seat, sound, session.local])

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · discs`} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · discs`} />
    </>
  )

  if (abandoned && !over) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  }
  if (showResults) {
    return <Results room={room} me={me} st={st} seats={seats} exit={exit} />
  }

  const mover = seats[live.turn]
  const skipped = live.passed !== undefined ? seats[live.passed] : null
  const status = live.result
    ? live.result.winner === -1
      ? 'It’s a draw'
      : mine(live.result.winner)
        ? 'You win the match'
        : `${seats[live.result.winner]?.name ?? 'They'} wins the match`
    : skipped
      ? session.local
        ? `${skipped.name} can’t move — ${mover?.name ?? 'next player'} again`
        : myTurn
        ? `${skipped.name} can’t move — go again`
        : `No move for you — ${mover?.name ?? 'they'} goes again`
      : myTurn && !session.local
        ? 'Your turn'
        : `${mover?.name ?? 'Opponent'}’s turn`

  return (
    <main className="otm screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · discs`} />
        <div className={`ot-turn${myTurn ? ' ot-turn--you' : ''}`} aria-live="polite">
          <span className="label">{over ? 'Done' : `${empty} left`}</span>
          <Disc seat={live.result ? (live.result.winner === -1 ? null : live.result.winner) : live.turn} />
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · discs`} />
      </div>

      <p className={`ot-status${myTurn ? ' ot-status--you' : ''}${live.result ? ' ot-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="ot-stage">
        <OthelloBoard live={live} mySeat={me.seat} myTurn={myTurn} hints={st.hints} onPlay={place} />
      </div>

      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({
  room,
  me,
  st,
  seats,
  exit,
}: {
  room: Room
  me: Me
  st: OthelloState
  seats: [Seated | null, Seated | null]
  exit: MatchExit
}) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const s = [count(st.live.board, 0), count(st.live.board, 1)]
  const winner = (st.live.result?.winner ?? -1) as Seat | -1
  // on one device the winner is whoever won — there's no "you" to compare against
  const iWon = session.local ? winner !== -1 : winner === me.seat
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

  // host deals a fresh board once both are ready (same hints setting, the other player starts)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialOthelloState(st.hints, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.hints, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Othello',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${COLOUR[k]} · discs` })) as CardInput['players'],
    detail: {
      kind: 'othello',
      board: st.live.board,
      last: st.live.last,
      stats: [['Margin', margin(s[0], s[1])], ['Squares filled', `${64 - st.live.board.split('').filter((v) => v === '.').length} / 64`]],
    },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="otm otm-results screen-in">
      {iWon && <Confetti />}
      <div className="otm-results__head">
        <ResultMark winner={winner} />
        <p className="label">Match {st.match} · Othello</p>
        <h1 className={`otm-results__title${iWon ? ' otm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="otm-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
      </div>
      <div className="mt-hud otm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={`${COLOUR[0]} · discs`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={`${COLOUR[1]} · discs`} />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Othello', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={oppGone}
        onReady={readyUp}
        onLeave={exit.now}
      />
    </main>
  )
}
