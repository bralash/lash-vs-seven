import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { TopBar } from '../components/TopBar'
import { CATEGORY_LABEL, GAMES, type Category, type GameMeta } from '../games/registry'
import { useSound } from '../lib/sound'
import { Rivals } from './Rivals'
import '../styles/home.css'

type Filter = 'all' | Category

// Occasions, not instructions — one line under the title. Phones show as many as fit on one row.
// Playable games first; within each group, registry order is kept (Array.sort is stable).
const ORDERED = [...GAMES].sort((a, b) => Number(a.status !== 'live') - Number(b.status !== 'live'))

const MODES = ['Date nights', 'Friendly battles', 'Long-distance rivals', 'Family game night']
const FILTERS: Filter[] = ['all', 'word', 'board', 'card', 'puzzle']

const TICKER = [
  ['STONE', 800], ['HUNT', 400], ['CRANE', 800], ['KENTE', 800], ['SEVEN', 800], ['LASH', 400],
  ['GRID', 400], ['WORDS', 800], ['RACE', 400], ['TILES', 800], ['DRAGON', 1400], ['ANT', 100],
] as const

export function Home() {
  const [filter, setFilter] = useState<Filter>('all')
  const { play } = useSound()

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: GAMES.length, word: 0, board: 0, card: 0, puzzle: 0 }
    GAMES.forEach((g) => c[g.category]++)
    return c
  }, [])

  const shown = filter === 'all' ? ORDERED : ORDERED.filter((g) => g.category === filter)

  return (
    <>
      <div className="page screen-in">
        <TopBar left={<Logo />} />

        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="hero__title">
            <span className="hero__line">Lash <span className="hero__vs">vs</span></span>
            <span className="hero__line hero__seven">Seven</span>
          </h1>
          <ul className="hero__modes" aria-label="Made for">
            {MODES.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>

        <Rivals />

        <section aria-labelledby="games-title">
          <div className="games-head">
            <h2 id="games-title">Pick a game</h2>
            <div className="seg" role="group" aria-label="Filter games">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="seg__btn"
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f)
                    play('tap')
                  }}
                >
                  {f === 'all' ? 'All' : CATEGORY_LABEL[f]}
                  <span className="seg__count">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="games">
            {shown.map((g) => (
              <li key={g.slug}>
                <GameCard game={g} index={ORDERED.indexOf(g)} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="ticker" aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row} className="ticker__row" data-row={row}>
            {[...TICKER, ...TICKER].map(([w, pts], i) => (
              <span key={i} className="tick">
                {w}
                <b>{pts}</b>
              </span>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function GameCard({ game, index }: { game: GameMeta; index: number }) {
  const num = String(index + 1).padStart(2, '0')
  const tiles = game.tiles.split('')
  const body = (
    <>
      <div className="card__top">
        <span className="card__num">{num}</span>
        <span className="card__cat">{CATEGORY_LABEL[game.category]}</span>
        {game.status === 'live' ? (
          <span className="stamp stamp--live">Live</span>
        ) : (
          <span className="stamp">Soon</span>
        )}
      </div>
      <div className="card__tiles" aria-hidden="true">
        {tiles.map((t, i) => (
          <span key={i} style={{ animationDelay: `${i * 60}ms` }}>{t}</span>
        ))}
      </div>
      <h3 className="card__name">{game.name}</h3>
      <p className="card__blurb">{game.blurb}</p>
      <p className="card__meta">
        2 players · {game.length} · {game.modes}
      </p>
      {game.status === 'live' && (
        <span className="card__cta" aria-hidden="true">
          Play <span className="keycap">↵</span>
        </span>
      )}
      {game.status !== 'live' && game.classic && (
        // a plain link: the classic site lives outside this app
        <a className="card__classic" href={`/classic/${game.slug}`}>
          Play the classic <span aria-hidden="true">↗</span>
        </a>
      )}
    </>
  )

  if (game.status === 'live') {
    return (
      <Link to={`/${game.slug}`} className="card card--live">
        {body}
      </Link>
    )
  }
  return (
    <div className="card card--soon" aria-label={`${game.name} — coming soon`}>
      {body}
    </div>
  )
}
