import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { CREW_STYLES, OpsFace, hasOwnReactions, priceOf, setCrewLook, useCrewLook, type BaseMood, type OpsStyle } from '../components/OpsFace'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { buyLook, keepWornLook, ownsLook, useWallet } from '../match/chips'
import '../styles/lobby.css'
import '../styles/opsroom.css'

/**
 * The Locker (/locker): pick your Crew character, the face you wear on your score card in every
 * game on this device. The robots are free; the characters cost chips: tap one to see it, then buy
 * it here. Screen isn't here: it's Ops' own face. The wardrobe (outfits, hats, colours) is a teaser for now.
 */

const MOODS: { id: BaseMood; label: string }[] = [
  { id: 'idle', label: 'Waiting' },
  { id: 'think', label: 'Thinking' },
  { id: 'win', label: 'Wins' },
  { id: 'lose', label: 'Loses' },
  { id: 'draw', label: 'Draw' },
]

const SOON = [
  { title: 'Outfits', body: 'Kente, a tux, a football kit…' },
  { title: 'Hats & specs', body: 'Crowns, caps, shades.' },
  { title: 'Colours', body: 'Paint the head and screen.' },
]

export function Locker() {
  const look = useCrewLook()
  const { play } = useSound()
  const wallet = useWallet()
  // the face being looked at: the one worn, or a locked one tapped to see before buying
  const [seen, setSeen] = useState<OpsStyle>(look ?? CREW_STYLES[0].id)
  const [buying, setBuying] = useState<'busy' | 'short' | 'error' | null>(null)
  const current = CREW_STYLES.find((s) => s.id === seen) ?? CREW_STYLES[0]
  const { them } = current.pronouns
  // until the wallet loads, only the free faces count as yours
  const owns = (l: OpsStyle) => ownsLook(wallet?.owned, l)
  // the face you're wearing is yours (it was picked before faces went on sale)
  const locked = !owns(seen) && seen !== look

  // anyone already wearing a character when they went on sale keeps it
  useEffect(() => {
    if (wallet && look && !ownsLook(wallet.owned, look)) keepWornLook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!wallet])

  const buy = async () => {
    setBuying('busy')
    const res = await buyLook(seen)
    if (res === 'ok') {
      play('findBig')
      setCrewLook(seen)
      setBuying(null)
    } else {
      play('error')
      setBuying(res)
    }
  }

  return (
    <div className="page screen-in">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">Locker</span>
          </>
        }
      />

      <main className="lobby__main lobby__main--wide opsroom">
        <div className="lobby__hero">
          <div className="opsroom__star">
            <OpsFace key={seen} look={seen} mood="hello" size={132} />
          </div>
          <p className="label">The Crew</p>
          <h1 className="lobby__title">Pick your character</h1>
          <p className="hint">{look ? 'You wear them on your score card in every game on this device' : 'Nothing picked yet: each match hands you one. Pick one to wear it in every game'} · Ops always plays as herself</p>
          {wallet && (
            <p className="opsroom__wallet">
              <Chip v={25} size={22} /> {wallet.chips.toLocaleString()} chips
            </p>
          )}
        </div>

        <section className="opsroom__section" aria-labelledby="looks-title">
          <h2 id="looks-title" className="opsroom__h">Characters</h2>
          <div className="opsroom__looks" role="radiogroup" aria-labelledby="looks-title">
            {CREW_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === seen}
                className={`opsroom__look${!owns(s.id) && s.id !== look ? ' opsroom__look--locked' : ''}`}
                onClick={() => {
                  if (s.id !== seen) play('tap')
                  setSeen(s.id)
                  setBuying(null)
                  // free or owned: wear it; locked: just look
                  if (owns(s.id)) setCrewLook(s.id)
                }}
              >
                {s.id === look && <span className="stamp stamp--live opsroom__picked">Wearing</span>}
                {!owns(s.id) && s.id !== look && (
                  <span className="opsroom__price">
                    <Chip v={25} size={16} /> {priceOf(s.id)}
                  </span>
                )}
                <OpsFace look={s.id} size={84} />
                <span className="opsroom__name">{s.name}</span>
                <span className="opsroom__blurb">{s.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="opsroom__section" aria-labelledby="moods-title">
          <h2 id="moods-title" className="opsroom__h">{current.name} in a game</h2>
          {locked && wallet && (
            <div className="opsroom__buy" aria-live="polite">
              <span>
                <Chip v={25} size={20} /> <b>{priceOf(seen)}</b> chips · you have {wallet.chips.toLocaleString()}
              </span>
              {wallet.chips >= priceOf(seen) ? (
                <button type="button" className="btn btn--primary" onClick={buy} disabled={buying === 'busy'}>
                  {buying === 'busy' ? 'Buying…' : `Buy ${current.name}`}
                </button>
              ) : (
                <span className="opsroom__need">{(priceOf(seen) - wallet.chips).toLocaleString()} more to go · win matches for chips</span>
              )}
              {buying === 'error' && <span className="error-text">Couldn’t buy right now. Check your connection and try again.</span>}
              {buying === 'short' && <span className="error-text">Not enough chips yet.</span>}
            </div>
          )}
          <ul className="opsroom__moods">
            {MOODS.map((m) => (
              <li key={`${seen}-${m.id}`}>
                <OpsFace look={seen} mood={m.id} size={60} />
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
          {!hasOwnReactions(seen) && (
            <p className="hint opsroom__note">{CREW_STYLES.filter((s) => hasOwnReactions(s.id)).map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} have all 18 reaction faces. {current.name} shows the nearest of these five for now.</p>
          )}
        </section>

        <section className="opsroom__section" aria-labelledby="wardrobe-title">
          <h2 id="wardrobe-title" className="opsroom__h">Wardrobe</h2>
          <ul className="opsroom__soon">
            {SOON.map((w) => (
              <li key={w.title} className="opsroom__soon-card">
                <span className="stamp">Soon</span>
                <span className="opsroom__name">{w.title}</span>
                <span className="opsroom__blurb">{w.body}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Dressing {them} up is coming soon</p>
        </section>
      </main>
    </div>
  )
}
