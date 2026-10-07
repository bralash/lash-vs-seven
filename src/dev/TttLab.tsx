import { useState } from 'react'
import type { Seat } from '../lobby/rooms'
import { TttBoard } from '../games/tictactoe/Board'
import { LINES, freshLive, type Live } from '../games/tictactoe/engine'
import '../styles/tictactoe.css'

// Dev-only sandbox for the Tic-Tac-Toe board (route: /dev/ttt): replay every win line and a draw.

/** A plausible finished board for a given winning line: the winner's three, plus a few of the loser's marks. */
function boardFor(line: number[], winner: Seat): string {
  const b = Array(9).fill('.')
  line.forEach((i) => (b[i] = String(winner)))
  const loser = String(1 - winner)
  ;[...Array(9).keys()].filter((i) => !line.includes(i)).slice(0, 2).forEach((i) => (b[i] = loser))
  return b.join('')
}

export default function TttLab() {
  const [live, setLive] = useState<Live>(freshLive(0, 1))
  const [n, setN] = useState(0)

  const show = (board: string, result: Live['result'], last: number) => {
    setN((k) => k + 1)
    setLive({ ...freshLive(0, n + 2), board, last, result })
  }

  return (
    <main className="page">
      <div className="ttt" style={{ paddingTop: 24 }}>
        <p className="label">Board lab · replay win lines</p>
        <div className="ttt-stage">
          <TttBoard live={live} mySeat={0} myTurn={false} onTap={() => {}} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {LINES.map((line, k) =>
            ([0, 1] as Seat[]).map((w) => (
              <button key={`${k}-${w}`} type="button" className="btn" style={{ fontSize: 14, padding: '8px 12px' }}
                data-line={line.join('')} data-winner={w}
                onClick={() => show(boardFor(line, w), { winner: w, line }, line[2])}>
                {w === 0 ? 'X' : 'O'} {line.join('-')}
              </button>
            )),
          )}
          <button type="button" className="btn" style={{ fontSize: 14, padding: '8px 12px' }} data-draw
            onClick={() => show('010011100', { winner: -1 }, 8)}>
            Draw
          </button>
        </div>
      </div>
    </main>
  )
}
