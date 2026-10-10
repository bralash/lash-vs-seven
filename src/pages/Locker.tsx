import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { CREW_STYLES, OpsFace, hasOwnReactions, setCrewLook, useCrewLook, type BaseMood, type OpsStyle } from '../components/OpsFace'
import { ITEMS, SLOTS, setWorn, useWear, type ItemId } from '../components/faces/wardrobe'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { keepWornLook, ownsItem, ownsLook, useWallet } from '../match/chips'
import '../styles/lobby.css'
import '../styles/opsroom.css'

/**
 * The Locker (/locker): what you own, and what you put on. Your Crew character (the face on your score
 * card in every game on this device) and what it wears from the wardrobe. Only things you own are
 * here: the robots and the party hat are everyone's, the rest comes from the shop (/shop). Screen
 * isn't here: it's Ops' own face.
 */

const MOODS: { id: BaseMood; label: string }[] = [
  { id: 'idle', label: 'Waiting' },
  { id: 'think', label: 'Thinking' },
  { id: 'win', label: 'Wins' },
  { id: 'lose', label: 'Loses' },
  { id: 'draw', label: 'Draw' },
]

export function Locker() {
  const look = useCrewLook()
  const wear = useWear()
  const { play } = useSound()
  const wallet = useWallet()
  // until the wallet loads, only the free things count as yours (and whatever you have on)
  const mineLook = (l: OpsStyle) => ownsLook(wallet?.owned, l) || l === look
  const mineItem = (id: ItemId) => ownsItem(wallet?.owned, id) || wear.includes(id)
  const looks = CREW_STYLES.filter((s) => mineLook(s.id))
  const items = ITEMS.filter((it) => mineItem(it.id))
  const shown = look ?? looks[0]?.id ?? CREW_STYLES[0].id
  const current = CREW_STYLES.find((s) => s.id === shown) ?? CREW_STYLES[0]
  const moreLooks = CREW_STYLES.length - looks.length
  const moreItems = ITEMS.length - items.length

  // anyone already wearing a character when they went on sale keeps it
  useEffect(() => {
    if (wallet && look && !ownsLook(wallet.owned, look)) keepWornLook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!wallet])

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
            <OpsFace key={`${shown}:${wear.join()}`} look={shown} mood="hello" size={132} wear={look ? wear : undefined} />
          </div>
          <p className="label">Your locker</p>
          <h1 className="lobby__title">{look ? current.name : 'Pick your character'}</h1>
          <p className="hint">{look ? 'On your score card in every game on this device' : 'Nothing picked yet: each match hands you one. Pick one to wear it, and what it has on, in every game'} · Ops always plays as herself</p>
          {wallet && (
            <Link to="/shop" className="opsroom__wallet" onClick={() => play('tap')}>
              <Chip v={25} size={22} /> {wallet.chips.toLocaleString()} chips · Shop
            </Link>
          )}
        </div>

        <section className="opsroom__section" aria-labelledby="looks-title">
          <h2 id="looks-title" className="opsroom__h">Characters</h2>
          <div className="opsroom__looks" role="radiogroup" aria-labelledby="looks-title">
            {looks.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === look}
                className="opsroom__look"
                onClick={() => {
                  if (s.id === look) return
                  play('tap')
                  setCrewLook(s.id)
                }}
              >
                {s.id === look && <span className="stamp stamp--live opsroom__picked">Wearing</span>}
                <OpsFace look={s.id} size={84} wear={s.id === look ? wear : undefined} />
                <span className="opsroom__name">{s.name}</span>
                <span className="opsroom__blurb">{s.blurb}</span>
              </button>
            ))}
            {moreLooks > 0 && (
              <Link to="/shop" className="opsroom__look opsroom__more" onClick={() => play('tap')}>
                <span className="opsroom__more-n">+{moreLooks}</span>
                <span className="opsroom__name">More in the shop</span>
                <span className="opsroom__blurb">Characters cost chips. Win matches to earn them.</span>
              </Link>
            )}
          </div>
        </section>

        <section className="opsroom__section" aria-labelledby="wardrobe-title">
          <h2 id="wardrobe-title" className="opsroom__h">Wardrobe</h2>
          {!look && <p className="hint opsroom__note">Pick a character above to wear these in games.</p>}
          {SLOTS.map((slot) => {
            const mine = items.filter((it) => it.slot === slot.id)
            if (!mine.length) return null
            return (
              <div key={slot.id} className="opsroom__slot">
                <h3 className="opsroom__slot-h">{slot.name}</h3>
                <div className="opsroom__items" role="group" aria-label={slot.name}>
                  {mine.map((it) => {
                    const on = wear.includes(it.id)
                    return (
                      <button
                        key={it.id}
                        type="button"
                        aria-pressed={on}
                        className="opsroom__look opsroom__item"
                        onClick={() => {
                          play('tap')
                          setWorn(it.id, !on)
                        }}
                      >
                        {on && <span className="stamp stamp--live opsroom__picked">On</span>}
                        <OpsFace look={shown} size={60} wear={[it.id]} />
                        <span className="opsroom__item-name">{it.name}</span>
                        <span className="opsroom__item-act">{on ? 'Take off' : 'Put on'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {moreItems > 0 && (
            <p className="hint opsroom__note">
              {moreItems} more in the <Link to="/shop">shop</Link>: hats, scarves, jerseys, gold paint.
            </p>
          )}
        </section>

        <section className="opsroom__section" aria-labelledby="moods-title">
          <h2 id="moods-title" className="opsroom__h">{current.name} in a game</h2>
          <ul className="opsroom__moods">
            {MOODS.map((m) => (
              <li key={`${shown}-${m.id}`}>
                <OpsFace look={shown} mood={m.id} size={60} wear={look ? wear : undefined} />
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
          {!hasOwnReactions(shown) && (
            <p className="hint opsroom__note">{CREW_STYLES.filter((s) => hasOwnReactions(s.id)).map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} have all 18 reaction faces. {current.name} shows the nearest of these five for now.</p>
          )}
        </section>
      </main>
    </div>
  )
}
