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
import { DotsBoard, Swatch } from './Board'
import { RESULT_MS, count, freshLive, play, type Live } from './engine'
import '../../styles/dots.css'

const GAME = 'dots'
const COLOUR = ['Orange', 'Blue'] as const
export const sizeLabel = (n: number) => `${n}×${n}`
/** "3 boxes" between the two scores, or "Level" */
export const margin = (a: number, b: number) => (a === b ? 'Level' : `${Math.abs(a - b)} box${Math.abs(a - b) === 1 ? '' : 'es'}`)

export interface DotsState {
  size: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialDotsState(size = 5, match = 1): DotsState {
  // whoever draws first alternates between matches
  const starter = (match % 2 === 1 ? 0 : 1) as Seat
  return { size, match, live: freshLive(size, starter) }
}

/** First letter of a name, for the boxes a player claims. */
const initial = (name: string | undefined, fallback: string) => (name?.trim()[0] ?? fallback).toUpperCase()

export function DotsMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as DotsState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  // "you" only means something online; on a shared device the cards follow whose turn it is
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const score = (s: Seat) => count(live.boxes, s)
  const left = live.boxes.split('').filter((v) => v === '.').length

  const over = !!live.result
  // the finished board stays up for a beat before the results take over
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  const myTurn = inMatch && live.turn === me.seat

  const draw = (line: number) => {
    if (!myTurn || live.lines[line] !== '.') return
    sound('tap')
    session.move<Live>((cur) => play(cur, me.seat, line)).catch(() => {})
  }

  // sounds: opponent's line, any box closing, and how the game ends
  const seenRef = useRef({ last: live.last, result: over })
  useEffect(() => {
    const seen = seenRef.current
    if (live.last !== seen.last && live.last >= 0) {
      const byMe = session.local || live.lines[live.last] === String(me.seat)
      if (live.closed && byMe) sound('find')
      else if (!byMe) sound('tick')
    }
    if (live.result && !seen.result) {
      const w = live.result.winner
      sound((session.local ? w !== -1 : w === me.seat) ? 'findBig' : w === -1 ? 'join' : 'end')
    }
    seenRef.current = { last: live.last, result: !!live.result }
  }, [live.last, live.lines, live.closed, live.result, me.seat, sound, session.local])

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · boxes`} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · boxes`} />
    </>
  )

  if (abandoned && !over) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  }
  if (showResults) {
    return <Results room={room} me={me} st={st} seats={seats} exit={exit} />
  }

  const mover = seats[live.turn]
  const lastBy = live.last >= 0 ? (Number(live.lines[live.last]) as Seat) : null
  const again = !!live.closed && lastBy === live.turn
  const status = live.result
    ? live.result.winner === -1
      ? 'It’s a draw'
      : mine(live.result.winner)
        ? 'You win the match'
        : `${seats[live.result.winner]?.name ?? 'They'} wins the match`
    : myTurn && !session.local
      ? again
        ? 'Box! Go again'
        : 'Your turn'
      : again
        ? `${mover?.name ?? 'Opponent'} closed a box — again`
        : `${mover?.name ?? 'Opponent'}’s turn`

  const initials: [string, string] = [initial(seats[0]?.name, '1'), initial(seats[1]?.name, '2')]

  return (
    <main className="dbm screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={session.local && !live.result && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · boxes`} />
        <div className={`db-turn${myTurn ? ' db-turn--you' : ''}`} aria-live="polite">
          <span className="label">{over ? 'Done' : `${left} left`}</span>
          <Swatch seat={live.result ? (live.result.winner === -1 ? null : live.result.winner) : live.turn} />
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={session.local && !live.result && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · boxes`} />
      </div>

      <p className={`db-status${myTurn ? ' db-status--you' : ''}${live.result ? ' db-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="db-stage">
        <DotsBoard live={live} mySeat={me.seat} myTurn={myTurn} initials={initials} onPlay={draw} />
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
  st: DotsState
  seats: [Seated | null, Seated | null]
  exit: MatchExit
}) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const s = [count(st.live.boxes, 0), count(st.live.boxes, 1)]
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

  // host deals a fresh board once both are ready (same size, the other player starts)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialDotsState(st.size, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.size, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Dots & Boxes',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${COLOUR[k]} · boxes` })) as CardInput['players'],
    detail: {
      kind: 'dots',
      size: st.size,
      lines: st.live.lines,
      boxes: st.live.boxes,
      initials: [initial(names[0], '1'), initial(names[1], '2')],
      stats: [['Board', sizeLabel(st.size)], ['Margin', margin(s[0], s[1])]],
    },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="dbm dbm-results screen-in">
      {iWon && <Confetti />}
      <div className="dbm-results__head">
        {winner !== -1 && <VsBlock mood="win" side={winner} eyes size={64} />}
        <p className="label">
          Match {st.match} · {sizeLabel(st.size)} board
        </p>
        <h1 className={`dbm-results__title${iWon ? ' dbm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="dbm-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
      </div>
      <div className="mt-hud dbm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={`${COLOUR[0]} · boxes`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={`${COLOUR[1]} · boxes`} />
      </div>
      <RivalryLine r={rivalry} />
      <div className="mt-share">
        <ShareResult card={card} won={iWon} message={shareMessage('Dots & Boxes', GAME, names, winner, scoreLine)} />
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
