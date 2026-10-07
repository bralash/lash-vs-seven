import { useEffect, useRef } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ShareResult } from '../../match/ShareResult'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalry } from '../../match/useRivalry'
import type { CardInput } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { CheckersBoard, Piece } from './Board'
import { QUIET_LIMIT, RESULT_MS, count, freshLive, kings, legalSteps, play, type Live } from './engine'
import '../../styles/checkers.css'

const GAME = 'checkers'
const COLOUR = ['Orange', 'Blue'] as const

export interface CheckersState {
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialCheckersState(match = 1): CheckersState {
  // whoever moves first alternates between matches
  const starter = (match % 2 === 1 ? 0 : 1) as Seat
  return { match, live: freshLive(starter) }
}

/** what a seat has left, e.g. "9 · 2 kings" */
const left = (board: string, s: Seat) => {
  const k = kings(board, s)
  return k ? `${COLOUR[s]} · ${k} king${k === 1 ? '' : 's'}` : `${COLOUR[s]} · pieces`
}

export function CheckersMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as CheckersState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  // "you" only means something online; on a shared device the cards follow whose turn it is
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const score = (s: Seat) => count(live.board, s)

  const over = !!live.result
  // the final board stays up for a beat before the results take over
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  const myTurn = inMatch && live.turn === me.seat

  const step = (from: number, to: number) => {
    if (!myTurn) return
    sound('tap')
    session.move<Live>((cur) => play(cur, me.seat, from, to)).catch(() => {})
  }

  // sounds: the opponent's moves, captures, crowning, and how the game ends
  const lastKey = live.last ? `${live.last.from}-${live.last.to}` : ''
  const crowns = kings(live.board, 0) + kings(live.board, 1)
  const seenRef = useRef({ key: lastKey, result: over, crowns })
  useEffect(() => {
    const seen = seenRef.current
    if (live.last && lastKey !== seen.key) {
      const piece = live.board[live.last.to]
      const byMe = session.local || Number(piece) % 2 === me.seat
      if (crowns > seen.crowns) sound('join') // crowned
      else if (live.last.captured !== undefined) sound(byMe ? 'find' : 'tick')
      else if (!byMe) sound('tick')
    }
    if (live.result && !seen.result) {
      const w = live.result.winner
      sound((session.local ? w !== -1 : w === me.seat) ? 'findBig' : w === -1 ? 'join' : 'end')
    }
    seenRef.current = { key: lastKey, result: !!live.result, crowns }
  }, [lastKey, live.last, live.board, live.result, crowns, me.seat, sound, session.local])

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={left(live.board, 0)} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={left(live.board, 1)} />
    </>
  )

  if (abandoned && !over) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  }
  if (showResults) {
    return <Results room={room} me={me} st={st} seats={seats} exit={exit} />
  }

  const mover = seats[live.turn]
  const who = myTurn && !session.local ? 'You' : (mover?.name ?? 'Opponent')
  const mustCapture = !live.result && legalSteps(live).some((s) => s.captured !== undefined)
  const status = live.result
    ? live.result.winner === -1
      ? 'Draw — no captures in 25 moves each'
      : mine(live.result.winner)
        ? 'You win the match'
        : `${seats[live.result.winner]?.name ?? 'They'} wins the match`
    : live.chain !== undefined
      ? `${who === 'You' ? 'Keep' : `${who}: keep`} jumping!`
      : mustCapture
        ? `${who} must capture`
        : myTurn && !session.local
          ? 'Your turn'
          : `${mover?.name ?? 'Opponent'}’s turn`

  // the draw count only matters once it's getting close
  const quietLeft = QUIET_LIMIT - live.quiet

  return (
    <main className="ckm screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={left(live.board, 0)} />
        <div className={`ck-turn${myTurn ? ' ck-turn--you' : ''}`} aria-live="polite">
          <span className="label">{over ? 'Done' : quietLeft <= 20 ? `Draw in ${Math.ceil(quietLeft / 2)}` : 'Turn'}</span>
          <Piece seat={live.result ? (live.result.winner === -1 ? null : live.result.winner) : live.turn} />
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={left(live.board, 1)} />
      </div>

      <p className={`ck-status${myTurn ? ' ck-status--you' : ''}${mustCapture ? ' ck-status--must' : ''}${live.result ? ' ck-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="ck-stage">
        <CheckersBoard live={live} mySeat={me.seat} myTurn={myTurn} flipped={!session.local && me.seat === 1} onStep={step} />
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
  st: CheckersState
  seats: [Seated | null, Seated | null]
  exit: MatchExit
}) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const board = st.live.board
  const s = [count(board, 0), count(board, 1)]
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

  // host deals a fresh board once both are ready (the other player moves first)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialCheckersState(st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const wonBy = winner === -1 ? '' : s[(1 - winner) as Seat] === 0 ? 'Took every piece' : 'Left them no moves'
  const card: CardInput = {
    game: 'Checkers',
    winner,
    scoreLine,
    headline: winner === -1 ? 'A DRAW' : wonBy.toUpperCase(),
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${COLOUR[k]} · pieces left` })) as CardInput['players'],
    detail: {
      kind: 'checkers',
      board,
      last: st.live.last?.to,
      stats: [
        ['Pieces left', scoreLine],
        ['Kings', `${kings(board, 0)} — ${kings(board, 1)}`],
      ],
    },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="ckm ckm-results screen-in">
      {iWon && <Confetti />}
      <div className="ckm-results__head">
        <p className="label">Match {st.match} · Checkers</p>
        <h1 className={`ckm-results__title${iWon ? ' ckm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="ckm-results__line">{winner === -1 ? 'No captures in 25 moves each' : wonBy}</p>
      </div>
      <div className="mt-hud ckm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={`${COLOUR[0]} · pieces left`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={`${COLOUR[1]} · pieces left`} />
      </div>
      <RivalryLine r={rivalry} />
      <div className="mt-share">
        <ShareResult card={card} won={iWon} message={shareMessage('Checkers', GAME, names, winner, scoreLine)} />
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
