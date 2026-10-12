import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from '../components/Icons'
import { useCrewLook } from '../components/OpsFace'
import { TopBar } from '../components/TopBar'
import { touchProfile } from '../lib/profile'
import { useSound } from '../lib/sound'
import { KEYS, load, save } from '../lib/storage'
import { floorsFor, gameAt, seasonDaysLeft, seasonName, TOP, type Floor } from '../tower/floors'
import { TowerCrown } from '../tower/TowerCrown'
import { TowerMap } from '../tower/TowerMap'
import { useClimb } from '../tower/tower'
import { Hearts } from '../tower/TowerSheet'
import '../styles/tower.css'

/*
 * Ops’ Tower (/tower): a road trip up to Ops, the whole width of the page (see tower/TowerMap.tsx).
 * Each guardian lives in a house along the road; you wait at your floor. Tap Play to take it on, or
 * tap any house's sign to see who lives there.
 */

export function TowerPage() {
  const climb = useClimb()
  // your character on the road (a robot if you haven't picked one)
  const me = useCrewLook() ?? 'bot'
  const navigate = useNavigate()
  const { play } = useSound()

  // no name yet: ask for one before the first floor (the guardians and the admin's list use it)
  const [askName, setAskName] = useState<Floor | null>(null)
  const go = (f: Floor) => {
    play('start')
    navigate(`/${gameAt(f, [0, 0])}`, { state: { tower: f.n } })
  }
  const climbFloor = (f: Floor) => (load(KEYS.name)?.trim() ? go(f) : setAskName(f))

  return (
    <div className="page screen-in tower-page">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">Ops’ Tower</span>
          </>
        }
      />
      <section className="tower-map" aria-label="The road to Ops">
        <header className="tower-bar">
          <div className="tower-bar__name">
            <p className="tower__kicker">{climb ? `${seasonName(climb.s)} season · ${seasonDaysLeft(climb.s)} days left` : 'This season'}</p>
            <h1 className="tower-bar__title">
              Ops’ Tower {climb?.champ && <TowerCrown size={28} />}
            </h1>
          </div>
          {climb && (
            <div className="tower-bar__status">
              <span className="tower__floor">
                {climb.champ ? (
                  'Champion'
                ) : (
                  <>
                    Floor <b>{climb.at}</b>/{TOP}
                  </>
                )}
              </span>
              <Hearts n={climb.hearts} size={18} />
            </div>
          )}
        </header>
        {climb ? <TowerMap floors={floorsFor(climb.s)} climb={climb} me={me} onPlay={climbFloor} /> : <p className="hint tower-map__loading">Loading your climb…</p>}
      </section>
      {askName &&
        createPortal(
          <NameSheet
            onDone={() => {
              setAskName(null)
              go(askName)
            }}
            onClose={() => setAskName(null)}
          />,
          document.body,
        )}

      <main className="tower">
        <section className="tower__rules" aria-label="How the Tower works">
          <h2>How it works</h2>
          <ul>
            <li>
              <b>Climb the road.</b> Beat each guardian at their own game to move on; Ops waits in her tower at the top. Tap a house’s sign to see who lives there.
            </li>
            <li>
              <b>Three hearts.</b> Lose a floor and you lose a heart. Reach a checkpoint (floor 4 or 7) and your hearts fill up again. Out of hearts, you drop back to the last checkpoint, hearts full.
            </li>
            <li>
              <b>Leaving a floor</b> part-way counts as losing it. A draw costs nothing: go again.
            </li>
            <li>
              <b>Twists.</b> On a clock floor, run out of time and a random move is played for you. Some guardians fire their Ultimate every time they score. At the top, Ops plays three games: win two.
            </li>
            <li>
              <b>Beat Ops</b> to be Tower champion for the month and win the Tower crown, a hat that can’t be bought.
            </li>
            <li>
              <b>Chips</b> for each floor the first time you clear it in a season. A new season every month: new climb, new neighbours, chips again.
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}

/** Your name, asked once before your first floor. */
function NameSheet({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState(false)
  const { play } = useSound()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const clean = name.trim().slice(0, 16)
    if (!clean) {
      setErr(true)
      play('error')
      return
    }
    save(KEYS.name, clean)
    touchProfile()
    onDone()
  }
  return (
    <div className="tm-sheet-wrap" onClick={onClose}>
      <form className="tm-sheet tm-sheet--name" role="dialog" aria-label="Your name" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <p className="tower__kicker">Before you climb</p>
        <h2 className="tm-sheet__title">What do we call you?</h2>
        <p className="tm-sheet__line">The guardians want to know who’s coming for them.</p>
        <input
          className="tm-name"
          value={name}
          onChange={(e) => {
            setErr(false)
            setName(e.target.value)
          }}
          placeholder="Your name"
          maxLength={16}
          autoFocus
          autoComplete="nickname"
          aria-label="Your name"
        />
        {err && (
          <p className="lobby__error error-text" role="alert">
            Add your name first.
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block">
          Start climbing
        </button>
      </form>
    </div>
  )
}

/** The homepage tile: where you are in the Tower. */
export function TowerTile({ onTap }: { onTap: () => void }) {
  const climb = useClimb()
  if (!climb) return null
  const f = floorsFor(climb.s).find((x) => x.n === climb.at)
  return (
    <Link to="/tower" className="corner__tile corner__tile--tower" onClick={onTap}>
      <span className="corner__title">
        Ops’ Tower {climb.champ ? <TowerCrown size={26} /> : <b>{climb.at}</b>}
      </span>
      <span className="corner__line">
        {climb.champ ? (
          'Champion this season'
        ) : (
          <>
            <Hearts n={climb.hearts} size={11} /> {f?.n === TOP ? 'Ops is waiting' : `Floor ${climb.at}: ${f?.guardianName}`}
          </>
        )}
      </span>
    </Link>
  )
}
