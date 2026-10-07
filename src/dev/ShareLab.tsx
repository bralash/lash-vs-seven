import { useEffect, useState } from 'react'
import { freshLive, play, type Live } from '../games/connect4/engine'
import { freshLive as dotsLive } from '../games/dots/engine'
import { margin } from '../games/dots/DotsMatch'
import { autoplay } from './DotsLab'
import { freshLive as othelloLive } from '../games/othello/engine'
import { margin as discMargin } from '../games/othello/OthelloMatch'
import { autoplay as othelloPlay } from './OthelloLab'
import { drawShareCard, type CardInput } from '../match/shareCard'

// Dev-only preview of result cards (route: /dev/share), with sample data for each game.

const players = (a: { score: string; meta: string }, b: { score: string; meta: string }): CardInput['players'] => [
  { name: 'Emmanuel', seat: 0, ...a },
  { name: 'Seven', seat: 1, ...b },
]

// a real decider played through the engine, so the card shows a position that can actually happen
function c4Sample(moves: number[]): CardInput {
  let live: Live = freshLive(1, 3, { s0: 1, s1: 1 })
  for (const col of moves) {
    const n = play(live, live.turn, col)
    if (!n) throw new Error(`illegal Connect Four move: column ${col}`)
    live = n
  }
  const s = [live.scores.s0, live.scores.s1]
  return {
    game: 'Connect Four', winner: live.result?.winner ?? -1, scoreLine: `${s[0]} — ${s[1]}`, link: 'lash-vs-seven.web.app/connect4',
    players: players({ score: String(s[0]), meta: 'Orange · games won' }, { score: String(s[1]), meta: 'Blue · games won' }),
    detail: { kind: 'c4', board: live.board, line: live.result?.line, stats: [['Series', 'Best of 3'], ['Games played', String(live.game)]] },
  }
}

// a full game played through the engine
function dotsSample(n: number): CardInput {
  const live = autoplay(dotsLive(n, 0), 0)
  const s = [0, 1].map((k) => live.boxes.split('').filter((v) => v === String(k)).length)
  return {
    game: 'Dots & Boxes', winner: live.result?.winner ?? -1, scoreLine: `${s[0]} — ${s[1]}`, link: 'lash-vs-seven.web.app/dots',
    players: players({ score: String(s[0]), meta: 'Orange · boxes' }, { score: String(s[1]), meta: 'Blue · boxes' }),
    detail: { kind: 'dots', size: n, lines: live.lines, boxes: live.boxes, initials: ['E', 'S'], stats: [['Board', `${n}×${n}`], ['Margin', margin(s[0], s[1])]] },
  }
}

// a full game played through the engine
function othelloSample(): CardInput {
  const live = othelloPlay(othelloLive(0), 0)
  const s = [0, 1].map((k) => live.board.split('').filter((v) => v === String(k)).length)
  return {
    game: 'Othello', winner: live.result?.winner ?? -1, scoreLine: `${s[0]} — ${s[1]}`, link: 'lash-vs-seven.web.app/othello',
    players: players({ score: String(s[0]), meta: 'Orange · discs' }, { score: String(s[1]), meta: 'Blue · discs' }),
    detail: { kind: 'othello', board: live.board, last: live.last, stats: [['Margin', discMargin(s[0], s[1])], ['Squares filled', `${64 - live.board.split('').filter((v) => v === '.').length} / 64`]] },
  }
}

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
  connect4: c4Sample([3, 3, 4, 2, 2, 4, 5, 6, 1, 5, 4, 3, 2, 5, 5, 6]),
  dots: dotsSample(5),
  othello: othelloSample(),
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
