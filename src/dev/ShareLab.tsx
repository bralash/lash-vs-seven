import { useEffect, useState } from 'react'
import { drawShareCard, type CardInput } from '../match/shareCard'

// Dev-only preview of result cards (route: /dev/share), with sample data for each game.

const players = (a: { score: string; meta: string }, b: { score: string; meta: string }): CardInput['players'] => [
  { name: 'Emmanuel', seat: 0, ...a },
  { name: 'Seven', seat: 1, ...b },
]

const SAMPLES: Record<string, CardInput> = {
  wordhunt: {
    game: 'Word Hunt', winner: 0, scoreLine: '6,400 — 3,900', link: 'lash-vs-seven.web.app/wordhunt',
    players: players({ score: '6,400', meta: '14 words' }, { score: '3,900', meta: '9 words' }),
    detail: { kind: 'grid', letters: 'WEITLNANPEDOCDSR'.split(''), path: [4, 1, 6, 5, 9, 10], word: 'LEANED', points: '+1,400', stats: [['Words found', '14 — 9'], ['Only you found', '6']] },
  },
  anagram: {
    game: 'Anagram Race', winner: 1, scoreLine: '2 — 3', link: 'lash-vs-seven.web.app/anagram',
    players: players({ score: '2', meta: 'rounds won' }, { score: '3', meta: 'rounds won' }),
    detail: { kind: 'rounds', rows: [
      { word: 'BRUSH', seat: 1, note: '27.1s' }, { word: 'AZURE', seat: null, note: 'time up' }, { word: 'STRIKE', seat: 0, note: '46.6s' },
      { word: 'TEMPLE', seat: 1, note: '16.0s' }, { word: 'AILERON', seat: 1, note: '0.7s' },
    ] },
  },
  ttt: {
    game: 'Tic-Tac-Toe', winner: 0, scoreLine: '2 — 1', link: 'lash-vs-seven.web.app/tictactoe',
    players: players({ score: '2', meta: 'X · games' }, { score: '1', meta: 'O · games' }),
    detail: { kind: 'ttt', board: '01.10.110'.split('').map((c, i) => ([0, 4, 8].includes(i) ? '0' : c)).join(''), line: [0, 4, 8], stats: [['Series', 'Best of 3'], ['Decider', 'Game 3']] },
  },
  draw: {
    game: 'Tic-Tac-Toe', winner: -1, scoreLine: '2 — 2', link: 'lash-vs-seven.web.app/tictactoe',
    players: players({ score: '2', meta: 'X · games' }, { score: '2', meta: 'O · games' }),
    detail: { kind: 'ttt', board: '010011100', stats: [['Series', 'Best of 5'], ['Last game', 'Draw']] },
  },
}

export default function ShareLab() {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    Object.entries(SAMPLES).forEach(([k, c]) => drawShareCard(c).then((b) => setUrls((u) => ({ ...u, [k]: URL.createObjectURL(b) }))))
  }, [])
  return (
    <main style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, background: '#555', minHeight: '100dvh' }}>
      {Object.keys(SAMPLES).map((k) => (
        <figure key={k} style={{ margin: 0, width: 'min(420px, 100%)' }}>
          {urls[k] && <img src={urls[k]} alt={k} data-k={k} style={{ width: '100%', display: 'block', border: '2px solid #000' }} />}
          <figcaption style={{ color: '#fff', fontFamily: 'monospace' }}>{k}</figcaption>
        </figure>
      ))}
    </main>
  )
}
