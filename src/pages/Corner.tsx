import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from '../components/Icons'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { ChipStack } from '../components/Chip'
import { useChips } from '../match/chips'
import { useDebts } from '../match/stakes'
import { Rivals, rivalsSummary } from './Rivals'
import { Stakes, stakesSummary } from './Stakes'
import '../styles/home.css'

/*
 * Your rivals and your stakes each get a page of their own; the homepage only shows a tile for each
 * (and only once there's something in it), so the games stay near the top.
 */

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page screen-in">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">{title}</span>
          </>
        }
      />
      <main className="corner-page">
        <h1 className="rivals__title">{title}</h1>
        {children}
      </main>
    </div>
  )
}

export function RivalsPage() {
  return (
    <Page title="Your rivals">
      <Rivals />
    </Page>
  )
}

export function StakesPage() {
  return (
    <Page title="Stakes">
      <Stakes />
    </Page>
  )
}

/** The homepage tiles: rivals (count + the latest score) and stakes (what's open, a badge when it's your tick). */
export function CornerTiles() {
  const [rivals] = useState(rivalsSummary)
  const { me, debts } = useDebts()
  const { play } = useSound()
  const chips = useChips()
  const stakes = me && debts.length ? stakesSummary(me, debts) : null
  if (!rivals && !stakes && chips === null) return null
  return (
    <nav className="corner" aria-label="Your chips, rivals and stakes">
      {chips !== null && (
        // the shop comes next; until then the tile just shows the pile
        <div className="corner__tile corner__tile--chips">
          <span className="corner__title">
            <ChipStack size={26} /> <b>{chips.toLocaleString()}</b>
          </span>
          <span className="corner__line">{chips ? 'Chips · shop soon' : 'Win matches for chips'}</span>
        </div>
      )}
      {rivals && (
        <Link to="/rivals" className="corner__tile" onClick={() => play('tap')}>
          <span className="corner__title">
            Rivals <b>{rivals.count}</b>
          </span>
          <span className="corner__line">{rivals.latest}</span>
        </Link>
      )}
      {stakes && (
        <Link to="/stakes" className="corner__tile" onClick={() => play('tap')}>
          <span className="corner__title">
            Stakes {stakes.waiting > 0 && <b className="corner__badge" aria-label={`${stakes.waiting} waiting on you`}>{stakes.waiting}</b>}
          </span>
          <span className="corner__line">{stakes.line}</span>
        </Link>
      )}
    </nav>
  )
}
