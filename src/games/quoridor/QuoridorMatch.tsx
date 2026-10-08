import { useEffect, useRef, useState } from 'react'
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
import { Pawn, QuoridorBoard, previewProblem, type Preview } from './Board'
import { RESULT_MS, freshLive, move, pathLeft, placeWall, wallsUsed, type Live } from './engine'
import '../../styles/quoridor.css'

const GAME = 'quoridor'

export interface QuoridorState {
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialQuoridorState(match = 1): QuoridorState {
  // whoever moves first alternates between matches
  return { match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

const toGo = (n: number) => `${n} step${n === 1 ? '' : 's'} to go`

export function QuoridorMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as QuoridorState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`

  const over = !!live.result
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  // on one device the board is in the hands of whoever's turn it is
  const seat: Seat = session.local ? live.turn : me.seat
  const myTurn = inMatch && live.turn === seat

  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => setPreview(null), [live.turn, live.result])

  const stepTo = (to: number) => {
    if (!myTurn) return
    sound('tap')
    session.move<Live>((cur) => move(cur, seat, to)).catch(() => {})
  }
  const wallAt = (p: Preview) => {
    if (!myTurn) return
    session.move<Live>((cur) => placeWall(cur, seat, p.down, p.at)).catch(() => {})
  }

  // sounds: walls going down, the other side's steps, and how it ends
  const lastKey = live.last ? `${live.last.seat}:${live.last.wall ?? `${live.last.from}-${live.last.to}`}` : ''
  const seenRef = useRef({ key: lastKey, result: over })
  useEffect(() => {
    const seen = seenRef.current
    if (live.last && lastKey !== seen.key) {
      const byMe = session.local || live.last.seat === me.seat
      if (live.last.wall !== undefined) sound('join')
      else if (!byMe) sound('tick')
    }
    if (live.result && !seen.result) sound(session.local || live.result.winner === me.seat ? 'findBig' : 'end')
    seenRef.current = { key: lastKey, result: over }
  }, [lastKey, live.last, live.result, over, me.seat, sound, session.local])

  const card = (s: Seat, active: boolean) => (
    <ScoreCard p={seats[s]} you={mine(s)} active={active} value={live.left[s]} meta={`walls · ${toGo(pathLeft(live, s))}`} />
  )
  const scoreboard = (
    <>
      {card(0, false)}
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      {card(1, false)}
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const problem = preview && previewProblem(live, seat, preview)
  const status = live.result
    ? mine(live.result.winner)
      ? 'You made it across!'
      : `${name(live.result.winner)} made it across`
    : session.local
      ? `${name(live.turn)}’s turn`
      : myTurn
        ? live.left[seat] > 0
          ? 'Your turn · move or wall'
          : 'Your turn · move'
        : `${name(live.turn)}’s turn`

  return (
    <main className="qrm screen-in">
      <div className="mt-hud">
        {card(0, session.local && inMatch && live.turn === 0)}
        <div className={`qr-turn${myTurn ? ' qr-turn--you' : ''}`} aria-live="polite">
          <span className="label">{over ? 'Done' : 'Turn'}</span>
          <Pawn seat={live.result ? live.result.winner : live.turn} />
        </div>
        {card(1, session.local && inMatch && live.turn === 1)}
      </div>

      <p className={`qr-status${myTurn ? ' qr-status--you' : ''}${live.result ? ' qr-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="qr-stage">
        <QuoridorBoard
          live={live}
          seat={seat}
          active={myTurn}
          flipped={!session.local && me.seat === 1}
          preview={preview}
          onPreview={setPreview}
          onMove={stepTo}
          onWall={wallAt}
        />
      </div>

      <div className="qr-bar" aria-live="polite">
        {preview && myTurn ? (
          <>
            <button type="button" className="btn" onClick={() => setPreview(null)} aria-label="Cancel wall">
              ✕
            </button>
            <button type="button" className="btn" onClick={() => setPreview({ ...preview, down: !preview.down })}>
              Turn ⟲
            </button>
            <button type="button" className="btn btn--primary" disabled={!!problem} onClick={() => wallAt(preview)}>
              {problem ?? 'Place wall'}
            </button>
          </>
        ) : (
          <p className="hint">
            {myTurn ? (live.left[seat] > 0 ? 'Tap a lit square to step · tap a groove to try a wall' : 'No walls left · tap a lit square to step') : ' '}
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

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: QuoridorState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
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
  const oppGone = room.status === 'abandoned' || !opp?.online

  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialQuoridorState(st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const loser = winner === -1 ? 1 : ((1 - winner) as Seat)
  const short = winner === -1 ? 0 : pathLeft(live, loser)
  const moves = live.moves ?? [0, 0]
  const used: [number, number] = [wallsUsed(live, 0), wallsUsed(live, 1)]
  const stepsWord = (n: number) => `${n} step${n === 1 ? '' : 's'}`
  const scoreLine = `by ${stepsWord(short)}`
  const line = winner === -1 ? '' : `${names[loser]} was ${stepsWord(short)} short`
  const card: CardInput = {
    game: 'Quoridor',
    winner,
    scoreLine,
    headline: winner === -1 ? undefined : `${short} STEP${short === 1 ? '' : 'S'} AHEAD`,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(pathLeft(live, k as Seat)), meta: 'steps to go' })) as CardInput['players'],
    detail: {
      kind: 'quoridor',
      pos: live.pos,
      walls: live.walls ?? [],
      stats: [
        ['Steps', `${moves[0]} · ${moves[1]}`],
        ['Walls placed', `${used[0]} · ${used[1]}`],
        ['Short by', String(short)],
      ],
    },
  }

  return (
    <main className="qrm qrm-results screen-in">
      {iWon && <Confetti />}
      <div className="qrm-results__head">
        <ResultMark winner={winner} />
        <p className="label">Match {st.match} · Quoridor</p>
        <h1 className={`qrm-results__title${iWon ? ' qrm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`}
        </h1>
        {line && <p className="qrm-results__line">{line}</p>}
      </div>
      <table className="qr-stats">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Stat</span>
            </th>
            <th scope="col">{names[0]}</th>
            <th scope="col">{names[1]}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Steps</th>
            <td>{moves[0]}</td>
            <td>{moves[1]}</td>
          </tr>
          <tr>
            <th scope="row">Walls placed</th>
            <td>{used[0]}</td>
            <td>{used[1]}</td>
          </tr>
        </tbody>
      </table>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Quoridor', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={oppGone}
        onReady={() => (sound('tap'), session.ready(me.id))}
        onLeave={exit.now}
      />
    </main>
  )
}
