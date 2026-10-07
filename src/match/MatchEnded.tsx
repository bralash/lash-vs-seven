import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MatchExit, Me } from '../lobby/Lobby'
import type { Room } from '../lobby/rooms'
import type { Seated } from './types'

interface Props {
  room: Room
  me: Me
  seats: [Seated | null, Seated | null]
  exit: MatchExit
  /** the game's own score summary (usually two ScoreCards) */
  scoreboard: ReactNode
}

/** Shown to whoever is left when a match is abandoned mid-way (someone left or dropped out). */
export function MatchEnded({ room, me, seats, exit, scoreboard }: Props) {
  const navigate = useNavigate()
  const leaver = seats.find((p) => p?.id === room.leftBy) ?? null
  const iLeft = room.leftBy === me.id
  const dropped = room.endReason === 'disconnected'
  const title = iLeft
    ? dropped ? 'You lost connection' : 'You left'
    : `${leaver?.name ?? 'Your opponent'} ${dropped ? 'dropped out' : 'left'}`
  const sub = iLeft
    ? 'The match ended while you were away.'
    : dropped
      ? 'They lost connection and didn’t make it back, so the match is over.'
      : 'They left the match, so it’s over. Start a new room to play again.'

  return (
    <main className="mt-ended screen-in">
      <div className="mt-ended__head">
        <p className="label">Match over</p>
        <h1 className="mt-ended__title">{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="mt-hud mt-ended__scores">{scoreboard}</div>
      <div className="mt-actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={exit.now}>
          New room <span className="keycap">↵</span>
        </button>
        {/* leave first so the finished room is cleaned up, then go home */}
        <button
          type="button"
          className="btn"
          onClick={() => {
            exit.now()
            navigate('/')
          }}
        >
          All games
        </button>
      </div>
    </main>
  )
}
