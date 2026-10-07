import { useState } from 'react'
import { Board, type Flash } from '../games/wordhunt/Board'
import '../styles/wordhunt.css'

// Dev-only sandbox for the Word Hunt board (route: /dev/board). Not included in production builds.
const GRID = 'ABCDEFGHIJKLMNOP'.split('')

export default function BoardLab() {
  const [live, setLive] = useState<number[]>([])
  const [log, setLog] = useState<string[]>([])
  const [flash, setFlash] = useState<Flash | null>(null)

  return (
    <main className="page">
      <div className="wh" style={{ paddingTop: 24 }}>
        <p className="label">Board lab · traced paths are logged, nothing is scored</p>
        <div className="wh-word" data-testid="live">{live.map((i) => GRID[i]).join('') || '—'}</div>
        <Board
          grid={GRID}
          disabled={false}
          flash={flash}
          onPathChange={setLive}
          onTrace={(p) => {
            setLog((l) => [p.map((i) => GRID[i]).join(''), ...l])
            setFlash({ cells: p, kind: 'good', id: Date.now() })
          }}
        />
        <ol data-testid="log" className="label" style={{ margin: 0 }}>
          {log.map((w, i) => <li key={i}>{w}</li>)}
        </ol>
      </div>
    </main>
  )
}
