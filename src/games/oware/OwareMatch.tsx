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
import { OwareBoard, sowMs, useSowing } from './Board'
import { TO_WIN, freshLive, legalMoves, play, sideOf, type Live } from './engine'
import '../../styles/oware.css'

const GAME = 'oware'
const COLOUR = ['Orange', 'Blue'] as const
/** Beat on the final board after the last sowing, before the results. */
const RESULT_MS = 1600

export interface OwareState {
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialOwareState(match = 1): OwareState {
  // whoever sows first alternates between matches
  return { match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

const seedsLabel = (n: number) => `${n} seed${n === 1 ? '' : 's'}`
const onSide = (live: Live, s: Seat) => sideOf(s).reduce((n, i) => n + live.pits[i], 0)

export function OwareMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as OwareState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]

  const view = useSowing(
    live,
    () => sound('tick'),
    () => sound('find'),
  )
  const over = !!live.result
  // let the last sowing play out, then hold the final board for a beat
  const showResults = useHold(over, sowMs(live) + RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  // online you sow on your turn; on one device whoever's turn it is
  const mover: Seat | null = inMatch && (session.local || live.turn === me.seat) ? live.turn : null
  const myTurn = mover !== null && !session.local

  const sow = (pit: number) => {
    if (mover === null || view.busy) return
    sound('tap')
    session.move<Live>((cur) => play(cur, mover, pit)).catch(() => {})
  }

  // a cheer (or not) when the game ends
  const ended = useRef(over)
  useEffect(() => {
    if (!live.result || ended.current) return
    ended.current = true
    const w = live.result.winner
    sound((session.local ? w !== -1 : w === me.seat) ? 'findBig' : w === -1 ? 'join' : 'end')
  }, [live.result, me.seat, sound, session.local])

  const card = (s: Seat, active: boolean, turn = false) => (
    <ScoreCard p={seats[s]} you={mine(s)} active={active} turn={turn} value={live.captured[s]} meta={`${COLOUR[s]} · captured`} />
  )
  const scoreboard = (
    <>
      {card(0, false)}
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      {card(1, false)}
    </>
  )

  if (abandoned && !over) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  }
  if (showResults) {
    return <Results room={room} me={me} st={st} seats={seats} exit={exit} />
  }

  const name = (s: Seat) => seats[s]?.name ?? (s === me.seat ? 'You' : 'They')
  const turnName = name(live.turn)
  const last = live.last
  const starving = inMatch && onSide(live, (1 - live.turn) as Seat) === 0

  const status = live.result
    ? live.result.winner === -1
      ? 'It’s a draw'
      : mine(live.result.winner)
        ? 'You win'
        : `${name(live.result.winner)} wins`
    : view.busy
      ? `${last ? name(last.seat) : turnName} is sowing…`
      : starving
        ? myTurn
          ? `${name((1 - live.turn) as Seat)} has no seeds — give them some`
          : `${turnName} must give ${session.local ? name((1 - live.turn) as Seat) : 'you'} seeds`
        : myTurn
          ? 'Your turn'
          : `${turnName}’s turn`

  // online your row sits along the bottom; on one device seat 0 sits at the bottom, seat 1 across the table
  const bottom: Seat = session.local ? 0 : me.seat

  return (
    <main className="owm screen-in">
      <div className="mt-hud">
        {card(0, session.local && inMatch && live.turn === 0, inMatch && live.turn === 0)}
        <div className={`ow-goal${myTurn ? ' ow-goal--you' : ''}`}>
          <span className="label">First to</span>
          <strong>{TO_WIN}</strong>
        </div>
        {card(1, session.local && inMatch && live.turn === 1, inMatch && live.turn === 1)}
      </div>

      <p className={`ow-status${myTurn && !view.busy ? ' ow-status--you' : ''}${live.result ? ' ow-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="ow-stage">
        <OwareBoard live={live} view={view} bottom={bottom} active={mover} onSow={sow} />
        <p className="ow-hint">
          {live.result
            ? reasonLine(live, name)
            : mover !== null && !view.busy
              ? `Tap a pit on your side to sow · ${legalMoves(live.pits, mover).length} to choose from`
              : `${live.moves} move${live.moves === 1 ? '' : 's'} played`}
        </p>
      </div>

      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/** How the game ended, in one line. */
function reasonLine(live: Live, name: (s: Seat) => string) {
  const r = live.result!
  if (r.reason === 'score') return `${name(r.winner as Seat)} captured ${TO_WIN} or more`
  const kept = `${name(0)} kept ${seedsLabel(onSide(live, 0))}, ${name(1)} ${seedsLabel(onSide(live, 1))}`
  return r.reason === 'stall' ? `No captures in a long while — each side keeps its seeds · ${kept}` : `No seeds left to share — each side keeps its seeds · ${kept}`
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
  st: OwareState
  seats: [Seated | null, Seated | null]
  exit: MatchExit
}) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const s = live.captured
  const winner = (live.result?.winner ?? -1) as Seat | -1
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

  // host sets up a fresh board once both are ready (the other player sows first)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialOwareState(st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const name = (k: Seat) => names[k]
  const card: CardInput = {
    game: 'Oware',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${COLOUR[k]} · seeds` })) as CardInput['players'],
    detail: {
      kind: 'oware',
      pits: live.pits,
      stats: [
        ['Moves', String(live.moves)],
        ['Margin', s[0] === s[1] ? 'Level' : seedsLabel(Math.abs(s[0] - s[1]))],
      ],
    },
  }

  const readyUp = () => {
    sound('tap')
    session.ready(me.id)
  }

  return (
    <main className="owm owm-results screen-in">
      {iWon && <Confetti />}
      <div className="owm-results__head">
        <ResultMark winner={winner} />
        <p className="label">Match {st.match} · Oware</p>
        <h1 className={`owm-results__title${iWon ? ' owm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="owm-results__line">{reasonLine(live, name)}</p>
      </div>
      <div className="mt-hud owm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={`${COLOUR[0]} · seeds`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={`${COLOUR[1]} · seeds`} />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Oware', GAME, names, winner, scoreLine)}
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
