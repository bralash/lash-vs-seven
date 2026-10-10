import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Chip } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { OpsFace, useCrewLook } from '../components/OpsFace'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { levelLabel } from '../match/bot'
import { floorsFor, gameAt, seasonDaysLeft, seasonName, TOP, twistLine, type Floor } from '../tower/floors'
import { TowerCrown } from '../tower/TowerCrown'
import { useClimb, type Climb } from '../tower/tower'
import { Hearts } from '../tower/TowerSheet'
import '../styles/tower.css'

/*
 * Ops' Tower (/tower): the floors stacked up to Ops at the top, your character on the floor you're
 * on. Cleared floors are ticked, the rest are locked; tap the glowing one to climb it.
 */

type FloorState = 'cleared' | 'current' | 'locked'

function stateOf(f: Floor, c: Climb): FloorState {
  // a champion can take Ops on again from the top
  if (f.n < c.at || (c.champ && f.n < TOP)) return 'cleared'
  return f.n === c.at ? 'current' : 'locked'
}

const chipFor = (n: number) => (n >= 100 ? 100 : n >= 25 ? 25 : 5)

function FloorRow({ f, st, paid, champ, me, onClimb, at }: { f: Floor; st: FloorState; paid: boolean; champ?: boolean; me: ReturnType<typeof useCrewLook>; onClimb: () => void; at: React.Ref<HTMLLIElement> }) {
  const boss = f.n === TOP
  return (
    <li ref={at} className={`tw-floor tw-floor--${st}${boss ? ' tw-floor--boss' : ''}`} style={{ '--n': f.n } as React.CSSProperties}>
      <span className="tw-floor__n" aria-label={`Floor ${f.n}`}>
        {f.n}
      </span>
      <span className="tw-floor__window" aria-hidden="true">
        {st === 'locked' && !boss && f.n > 3 ? <span className="tw-floor__mystery">?</span> : <OpsFace look={f.guardian} mood={st === 'cleared' ? 'lose' : st === 'current' ? 'smug' : 'idle'} size={boss ? 64 : 52} />}
      </span>
      <div className="tw-floor__main">
        <p className="tw-floor__who">
          {boss ? 'The boss' : f.guardianName}
          {f.checkpoint && <span className="tw-floor__flag">Checkpoint</span>}
        </p>
        <h2 className="tw-floor__game">{boss ? 'Ops herself' : f.gameName}</h2>
        <p className="tw-floor__meta">
          {boss ? f.gameName : levelLabel(f.level)}
          {f.twists.length > 0 && <span className="tw-floor__twist">{twistLine(f)}</span>}
        </p>
      </div>
      <div className="tw-floor__side">
        {st === 'current' ? (
          <button type="button" className="btn btn--primary tw-floor__go" onClick={onClimb}>
            {boss ? (champ ? 'Rematch' : 'Face Ops') : 'Climb'}
          </button>
        ) : st === 'cleared' ? (
          <span className="tw-floor__done" aria-label="Cleared">
            ✓
          </span>
        ) : (
          <svg className="tw-floor__lock" viewBox="0 0 24 24" width="22" height="22" aria-label="Locked">
            <rect x="4" y="10" width="16" height="12" rx="1" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" />
          </svg>
        )}
        <span className={`tw-floor__reward${paid ? ' tw-floor__reward--paid' : ''}`} aria-label={paid ? 'Chips collected this season' : `${f.reward} chips the first time`}>
          <Chip v={chipFor(f.reward)} size={20} />
          {f.reward}
        </span>
      </div>
      {st === 'current' && me && (
        <span className="tw-floor__me" aria-hidden="true">
          <OpsFace look={me} mood="think" size={40} />
        </span>
      )}
    </li>
  )
}

export function TowerPage() {
  const climb = useClimb()
  const me = useCrewLook()
  const navigate = useNavigate()
  const { play } = useSound()
  const current = useRef<HTMLLIElement>(null)
  const scrolled = useRef(false)

  useEffect(() => {
    if (!climb || scrolled.current) return
    // only up and down: let the page settle first, then bring your floor to the middle
    const t = setTimeout(() => {
      scrolled.current = true
      const r = current.current?.getBoundingClientRect()
      if (r) window.scrollTo({ top: window.scrollY + r.top - innerHeight / 2 + r.height / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }, 250)
    return () => clearTimeout(t)
  }, [climb])

  const climbFloor = (f: Floor) => {
    play('start')
    navigate(`/${gameAt(f, [0, 0])}`, { state: { tower: f.n } })
  }

  return (
    <div className="page screen-in">
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
      <main className="tower">
        <header className="tower__head">
          <p className="tower__kicker">{climb ? `${seasonName(climb.s)} season · ${seasonDaysLeft(climb.s)} days left` : 'This season'}</p>
          <h1 className="tower__title">Ops’ Tower</h1>
          <p className="tower__sub">Beat each guardian to climb. Ops waits at the top.</p>
          {climb?.champ && (
            <p className="tower__champ">
              <TowerCrown size={38} /> Tower champion · {seasonName(climb.s)}
            </p>
          )}
          {climb && (
            <div className="tower__status">
              <span className="tower__floor">
                Floor <b>{climb.at}</b> / {TOP}
              </span>
              <Hearts n={climb.hearts} size={22} />
            </div>
          )}
        </header>

        {climb ? (
          <div className="tw-building">
            <span className="tw-roof__flag" aria-hidden="true">
              <OpsFace size={30} />
            </span>
            <div className="tw-roof" aria-hidden="true" />
            <ol className="tw-floors" reversed>
              {[...floorsFor(climb.s)].reverse().map((f) => {
                const st = stateOf(f, climb)
                return <FloorRow key={f.n} f={f} st={st} paid={!!climb.got?.[f.n]} champ={climb.champ} me={me} onClimb={() => climbFloor(f)} at={st === 'current' ? current : null} />
              })}
            </ol>
            <div className="tw-ground" aria-hidden="true" />
          </div>
        ) : (
          <p className="hint">Loading your climb…</p>
        )}

        <section className="tower__rules" aria-label="How the Tower works">
          <h2>How it works</h2>
          <ul>
            <li>
              <b>Three hearts.</b> Lose a floor and you lose a heart. Out of hearts, you drop back to the last checkpoint (floor 4 or 7) and the hearts fill up.
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
              <b>Chips</b> for each floor the first time you clear it in a season. A new season every month: new climb, chips again.
            </li>
          </ul>
        </section>
      </main>
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
