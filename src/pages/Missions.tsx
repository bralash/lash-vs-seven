import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Chip, ChipStack } from '../components/Chip'
import { useChipFlight } from '../components/ChipFlight'
import { ArrowLeft } from '../components/Icons'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { useChips } from '../match/chips'
import { BONUS, BONUS_ID, collect, REWARD, TIER_NAME, timeLeft, useMissions, type MissionView, type WeekView } from '../match/missions'
import '../styles/missions.css'

/*
 * This week's missions: three cards, easy to hard, each with its progress and its chips; a finished
 * one has a Collect button that sends the chips flying into your pile. Collect all three for the
 * bonus. The homepage shows a tile (MissionsTile) that opens this page.
 */

/** a balance that counts up to its new value instead of jumping */
function useCountUp(n: number | null) {
  const [shown, setShown] = useState(n)
  const from = useRef(n)
  useEffect(() => {
    if (n === null) return
    const start = from.current ?? n
    from.current = n
    if (start === n || matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(n)
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setShown(Math.round(start + (n - start) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    // wait for the chips to land first
    const wait = setTimeout(() => (raf = requestAnimationFrame(step)), 550)
    return () => {
      clearTimeout(wait)
      cancelAnimationFrame(raf)
    }
  }, [n])
  return shown
}

/** The progress as chunky segments (up to 12), or a solid bar past that. */
function Bar({ n, target }: { n: number; target: number }) {
  return (
    <div className="msn__bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={n} aria-label={`${n} of ${target}`}>
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`msn__seg${i < n ? ' msn__seg--on' : ''}`} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}

function Card({ x, busy, onCollect }: { x: MissionView; busy: boolean; onCollect: (el: HTMLElement) => void }) {
  const reward = REWARD[x.m.tier]
  const state = x.got ? 'got' : x.done ? 'done' : 'on'
  return (
    <li className={`msn msn--t${x.m.tier} msn--${state}`}>
      <span className="msn__tier">{TIER_NAME[x.m.tier]}</span>
      <div className="msn__main">
        <h2 className="msn__name">{x.m.name}</h2>
        <p className="msn__blurb">{x.m.blurb}</p>
        <div className="msn__progress">
          <Bar n={x.n} target={x.m.target} />
          <span className="msn__count">
            {x.n}/{x.m.target}
          </span>
        </div>
      </div>
      <div className="msn__side">
        {state === 'done' ? (
          <button type="button" className="btn btn--primary msn__collect" disabled={busy} onClick={(e) => onCollect(e.currentTarget)}>
            Collect
            <span>+{reward}</span>
          </button>
        ) : (
          <span className="msn__reward" aria-label={`${reward} chips`}>
            <Chip v={reward >= 100 ? 100 : 25} size={30} />+{reward}
          </span>
        )}
      </div>
      {x.got && (
        <span className="msn__stamp" aria-label="Collected">
          Done
        </span>
      )}
    </li>
  )
}

export function MissionsPage() {
  const week = useMissions()
  const chips = useChips()
  const balance = useCountUp(chips)
  const pile = useRef<HTMLSpanElement>(null)
  const { fly, layer } = useChipFlight()
  const { play } = useSound()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const take = async (id: string, el: HTMLElement) => {
    setBusy(id)
    setError(false)
    play('tap')
    const paid = await collect(id)
    setBusy(null)
    if (!paid) {
      play('error')
      setError(true)
      return
    }
    fly(el, pile.current, paid)
    setTimeout(() => play('findBig'), 700)
  }

  const earned = week ? week.list.filter((x) => x.got).reduce((s, x) => s + REWARD[x.m.tier], 0) + (week.bonus.got ? BONUS : 0) : 0
  const total = week ? week.list.reduce((s, x) => s + REWARD[x.m.tier], 0) + BONUS : 0

  return (
    <div className="page screen-in">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">Missions</span>
          </>
        }
      />
      <main className="missions">
        <header className="missions__head">
          <div>
            <p className="missions__kicker">Weekly missions</p>
            <h1 className="missions__title">This week</h1>
            {week && <p className="missions__ends">New missions in {timeLeft(week.week)} · Monday 00:00 GMT</p>}
          </div>
          <Link to="/shop" className="missions__pile" aria-live="polite" aria-label={`${chips ?? 0} chips, open the shop`}>
            <span ref={pile}>
              <ChipStack size={28} />
            </span>
            <b>{balance === null ? '…' : balance.toLocaleString()}</b>
          </Link>
        </header>

        {week ? (
          <>
            <div className="missions__haul" aria-label={`${earned} of ${total} chips collected this week`}>
              <span className="missions__haul-fill" style={{ width: `${(earned / total) * 100}%` }} />
              <span className="missions__haul-text">
                {earned} / {total} chips this week
              </span>
            </div>

            <ol className="missions__list">
              {week.list.map((x) => (
                <Card key={x.m.id} x={x} busy={busy === x.m.id} onCollect={(el) => take(x.m.id, el)} />
              ))}
            </ol>

            <Bonus week={week} busy={busy === BONUS_ID} onCollect={(el) => take(BONUS_ID, el)} />
            {error && <p className="missions__error">Couldn’t collect right now. Check your connection and try again.</p>}
          </>
        ) : (
          <p className="hint">Loading this week’s missions…</p>
        )}

        <section className="missions__rules" aria-label="What counts">
          <h2>What counts</h2>
          <ul>
            <li>
              <b>Online with friends</b> everything counts
            </li>
            <li>
              <b>Against Ops</b> only Ops missions
            </li>
            <li>
              <b>Pass &amp; play, watching</b> nothing
            </li>
          </ul>
          <p className="hint">A match counts when it pays chips. Wins past three a day against the same friend count as played, not won.</p>
        </section>
      </main>
      {layer}
    </div>
  )
}

function Bonus({ week, busy, onCollect }: { week: WeekView; busy: boolean; onCollect: (el: HTMLElement) => void }) {
  const { ready, got } = week.bonus
  return (
    <div className={`msn-bonus${ready && !got ? ' msn-bonus--ready' : ''}${got ? ' msn-bonus--got' : ''}`}>
      <div className="msn-bonus__ticks" aria-hidden="true">
        {week.list.map((x) => (
          <span key={x.m.id} className={`msn-bonus__tick msn-bonus__tick--t${x.m.tier}${x.got ? ' msn-bonus__tick--on' : ''}`}>
            {x.got ? '✓' : ''}
          </span>
        ))}
      </div>
      <div className="msn-bonus__main">
        <b>Clean sweep</b>
        <span>{got ? 'Collected. See you next week.' : 'Collect all three for a bonus'}</span>
      </div>
      {ready && !got ? (
        <button type="button" className="btn btn--primary msn__collect" disabled={busy} onClick={(e) => onCollect(e.currentTarget)}>
          Collect
          <span>+{BONUS}</span>
        </button>
      ) : (
        <span className="msn__reward">
          <Chip v={25} size={30} />+{BONUS}
        </span>
      )}
    </div>
  )
}

/** The homepage tile: three little bars, and a badge when there's something to collect. */
export function MissionsTile({ onTap }: { onTap: () => void }) {
  const week = useMissions()
  if (!week) return null
  return (
    <Link to="/missions" className={`corner__tile corner__tile--missions${week.waiting ? ' corner__tile--collect' : ''}`} onClick={onTap}>
      <span className="corner__title">
        This week{' '}
        {week.waiting > 0 && (
          <b className="corner__badge" aria-label={`${week.waiting} to collect`}>
            {week.waiting}
          </b>
        )}
      </span>
      <span className="corner__bars" aria-hidden="true">
        {week.list.map((x) => (
          <span key={x.m.id} className={`corner__bar corner__bar--t${x.m.tier}`}>
            <span style={{ width: `${(x.n / x.m.target) * 100}%` }} />
          </span>
        ))}
      </span>
      <span className="corner__line">{week.waiting ? 'Chips to collect!' : `Missions · ${timeLeft(week.week)} left`}</span>
    </Link>
  )
}
