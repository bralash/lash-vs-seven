import { useState } from 'react'
import { C4Board } from '../games/connect4/Board'
import { freshLive, play, type Live } from '../games/connect4/engine'
import '../styles/connect4.css'

// Dev-only sandbox for the Connect Four board (route: /dev/c4): replay wins and drops.

const SEQUENCES: Record<string, number[]> = {
  vertical: [0, 1, 0, 1, 0, 1, 0],
  horizontal: [0, 0, 1, 1, 2, 2, 3],
  'diagonal ↗': [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3],
  'diagonal ↘': [3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0],
}

export default function C4Lab() {
  const [live, setLive] = useState<Live>(freshLive(0, 1))
  const [n, setN] = useState(1)

  const replay = (cols: number[]) => {
    let l = freshLive(0, n + 1)
    for (const c of cols) l = play(l, l.turn, c) ?? l
    setN((k) => k + 1)
    setLive(l)
  }

  return (
    <main className="page">
      <div className="c4m" style={{ paddingTop: 24 }}>
        <p className="label">Board lab · tap columns to drop, or replay a win</p>
        <div className="c4-stage">
          <C4Board live={live} mySeat={live.turn} myTurn={!live.result} onDrop={(c) => setLive((l) => play(l, l.turn, c) ?? l)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {Object.entries(SEQUENCES).map(([k, cols]) => (
            <button key={k} type="button" className="btn" data-seq={k} style={{ fontSize: 14, padding: '8px 12px' }} onClick={() => replay(cols)}>
              {k}
            </button>
          ))}
          <button type="button" className="btn" data-seq="reset" style={{ fontSize: 14, padding: '8px 12px' }} onClick={() => { setN((k) => k + 1); setLive(freshLive(0, n + 1)) }}>
            Reset
          </button>
        </div>
      </div>
    </main>
  )
}
