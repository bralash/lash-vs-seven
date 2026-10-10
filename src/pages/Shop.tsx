import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Chip, ChipStack } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { CREW_STYLES, OpsFace, priceOf, setCrewLook, useCrewLook, type OpsStyle } from '../components/OpsFace'
import { ITEMS, SLOTS, setWorn, useWear, type ItemId } from '../components/faces/wardrobe'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { buyItem, buyLook, chipsFor, keepWornLook, ownsItem, ownsLook, useWallet, type ChipValue } from '../match/chips'
import { SHELVES, type ShelfId } from '../match/shop'
import '../styles/lobby.css'
import '../styles/shop.css'

/**
 * The shop (/shop): spend chips on looks. Your pile sits at the top; each shelf is a tab. Characters
 * and the wardrobe are on sale: Buy (with a check first), and paying sends chips flying from your pile
 * onto the item, which goes straight on. Then Wear / Put on / Take off. The other shelves show
 * what's coming and what it will cost. What you own is also in the Locker.
 */

/** the first sentence of a character's blurb */
const short = (s: string) => s.split(/(?<=\.)\s/)[0]
const SHELF_KEY = 'lvs_shop_shelf'

interface Flight {
  id: number
  v: ChipValue
  x: number
  y: number
  dx: number
  dy: number
  delay: number
}

export function Shop() {
  const { play } = useSound()
  const wallet = useWallet()
  const look = useCrewLook()
  const wear = useWear()
  const [shelf, setShelf] = useState<ShelfId>(() => {
    try {
      return (sessionStorage.getItem(SHELF_KEY) as ShelfId | null) ?? 'characters'
    } catch {
      return 'characters'
    }
  })
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; msg: string } | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [justBought, setJustBought] = useState<string | null>(null)
  const pileRef = useRef<HTMLSpanElement>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})

  const current = SHELVES.find((s) => s.id === shelf) ?? SHELVES[0]
  // the wardrobe is shown on your character (or Bot, if you haven't picked one)
  const model: OpsStyle = look ?? 'bot'

  // anyone already wearing a character when they went on sale keeps it
  useEffect(() => {
    if (wallet && look && !ownsLook(wallet.owned, look)) keepWornLook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!wallet])

  const pickShelf = (id: ShelfId) => {
    if (id === shelf) return
    play('tap')
    setShelf(id)
    setConfirm(null)
    try {
      sessionStorage.setItem(SHELF_KEY, id)
    } catch {
      /* fine: it just won't be remembered */
    }
  }

  /** chips leave the pile and land on the card */
  const fly = (id: string, price: number) => {
    const from = pileRef.current?.getBoundingClientRect()
    const to = cardRefs.current[id]?.getBoundingClientRect()
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const vs = chipsFor(price, 6)
    const x = from.left + from.width / 2 - 14
    const y = from.top + from.height / 2 - 14
    const stamp = Date.now()
    setFlights(
      vs.map((v, i) => ({
        id: stamp + i,
        v,
        x,
        y,
        dx: to.left + to.width / 2 - 14 - x + (i - vs.length / 2) * 8,
        dy: to.top + to.height * 0.35 - 14 - y,
        delay: i * 70,
      })),
    )
    vs.forEach((_, i) => setTimeout(() => play('clack'), 420 + i * 70))
    setTimeout(() => setFlights([]), 700 + vs.length * 70)
  }

  /** buy something (a face or an item), then put it on */
  const buy = async (id: string, price: number, pay: () => Promise<'ok' | 'short' | 'error'>, putOn: () => void) => {
    setConfirm(null)
    setError(null)
    setBusy(id)
    const res = await pay()
    setBusy(null)
    if (res === 'ok') {
      fly(id, price)
      setJustBought(id)
      setTimeout(() => setJustBought(null), 1800)
      setTimeout(() => play('findBig'), 650)
      putOn()
    } else {
      play('error')
      setError({ id, msg: res === 'short' ? 'Not enough chips yet.' : 'Couldn’t buy right now. Check your connection and try again.' })
    }
  }

  /** the buy area for something you don't own yet: Buy → "Spend n?" → Buy */
  const buyArea = (id: string, price: number, onBuy: () => void) => {
    const need = wallet ? price - wallet.chips : 0
    if (!wallet) return <span className="shop__note">…</span>
    if (confirm === id)
      return (
        <div className="shop__confirm">
          <span>
            Spend <b>{price.toLocaleString()}</b>?
          </span>
          <button type="button" className="btn btn--primary" onClick={onBuy}>
            Buy
          </button>
          <button type="button" className="shop__cancel" onClick={() => setConfirm(null)}>
            Not now
          </button>
        </div>
      )
    if (need > 0) return <span className="shop__note">{need.toLocaleString()} more to go</span>
    return (
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy !== null}
        onClick={() => {
          play('tap')
          setError(null)
          setConfirm(id)
        }}
      >
        {busy === id ? 'Buying…' : 'Buy'}
      </button>
    )
  }

  /** one card on a shelf */
  const card = (id: string, o: { price: number; mine: boolean; on: boolean; onLabel: string; face: ReactNode; name: string; desc: string; act: ReactNode }) => (
    <li
      key={id}
      ref={(el) => {
        cardRefs.current[id] = el
      }}
      className={`shop__item${o.on ? ' shop__item--wearing' : ''}${!o.mine ? ' shop__item--locked' : ''}${justBought === id ? ' shop__item--new' : ''}`}
    >
      {o.on && <span className="stamp stamp--live shop__stamp">{o.onLabel}</span>}
      {!o.mine && (
        <span className="shop__price">
          <Chip v={25} size={16} /> {o.price.toLocaleString()}
        </span>
      )}
      {o.mine && !o.on && <span className="shop__owned">{o.price ? 'Owned' : 'Free'}</span>}
      {o.face}
      <span className="shop__name">{o.name}</span>
      <span className="shop__desc">{o.desc}</span>
      <div className="shop__act">{o.act}</div>
      {error?.id === id && <span className="error-text shop__error">{error.msg}</span>}
    </li>
  )

  const characters = (
    <ul className="shop__grid shop__grid--looks">
      {CREW_STYLES.map((s) => {
        const price = priceOf(s.id)
        const wearing = s.id === look
        const mine = ownsLook(wallet?.owned, s.id) || wearing
        return card(s.id, {
          price,
          mine,
          on: wearing,
          onLabel: 'Wearing',
          face: <OpsFace look={s.id} mood={justBought === s.id ? 'win' : 'idle'} size={84} wear={wearing ? wear : undefined} />,
          name: s.name,
          desc: short(s.blurb),
          act: wearing ? (
            <span className="shop__note">On your score card</span>
          ) : mine ? (
            <button type="button" className="btn" onClick={() => (play('tap'), setCrewLook(s.id))}>
              Wear
            </button>
          ) : (
            buyArea(s.id, price, () => buy(s.id, price, () => buyLook(s.id), () => setCrewLook(s.id)))
          ),
        })
      })}
    </ul>
  )

  const wardrobe = SLOTS.map((slot) => (
    <div key={slot.id} className="shop__slot">
      <h3 className="shop__slot-h">{slot.name}</h3>
      <ul className="shop__grid">
        {ITEMS.filter((it) => it.slot === slot.id).map((it) => {
          const on = wear.includes(it.id)
          const mine = ownsItem(wallet?.owned, it.id) || on
          const toggle = (id: ItemId, v: boolean) => (play('tap'), setWorn(id, v))
          return card(it.id, {
            price: it.price,
            mine,
            on,
            onLabel: 'On',
            face: <OpsFace look={model} mood={justBought === it.id ? 'win' : 'idle'} size={72} wear={[it.id]} />,
            name: it.name,
            desc: it.blurb,
            act: on ? (
              <button type="button" className="btn" onClick={() => toggle(it.id, false)}>
                Take off
              </button>
            ) : mine ? (
              <button type="button" className="btn" onClick={() => toggle(it.id, true)}>
                Put on
              </button>
            ) : (
              buyArea(it.id, it.price, () => buy(it.id, it.price, () => buyItem(it.id), () => setWorn(it.id, true)))
            ),
          })
        })}
      </ul>
    </div>
  ))

  return (
    <div className="page screen-in">
      <TopBar
        left={
          <>
            <Link to="/" className="icon-btn" aria-label="All games">
              <ArrowLeft />
            </Link>
            <span className="topbar__title">Shop</span>
          </>
        }
      />

      <main className="lobby__main lobby__main--wide shop">
        <header className="shop__head">
          <div>
            <h1 className="shop__title">Shop</h1>
            <p className="hint shop__sub">Looks only · nothing here helps anyone win</p>
          </div>
          <p className="shop__pile" aria-live="polite">
            <span ref={pileRef}>
              <ChipStack size={28} />
            </span>
            <b>{wallet ? wallet.chips.toLocaleString() : '…'}</b>
            <span className="shop__pile-label">chips</span>
          </p>
        </header>

        <nav className="shop__tabs" role="tablist" aria-label="Shelves">
          {SHELVES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === shelf}
              aria-label={s.soon ? `${s.name} (coming soon)` : undefined}
              className={`shop__tab${s.soon ? ' shop__tab--soon' : ''}`}
              onClick={() => pickShelf(s.id)}
            >
              {s.name}
            </button>
          ))}
        </nav>

        <section className="shop__shelf" role="tabpanel" aria-label={current.name}>
          <p className="shop__blurb">{current.blurb}</p>

          {current.id === 'characters' ? (
            characters
          ) : current.id === 'wardrobe' ? (
            wardrobe
          ) : (
            <ul className="shop__grid">
              {(current.soon ?? []).map((it) => (
                <li key={it.name} className="shop__item shop__item--soon">
                  <span className="stamp shop__stamp">Soon</span>
                  <span className="shop__price">
                    <Chip v={25} size={16} /> {it.price.toLocaleString()}
                  </span>
                  <span className="shop__name">{it.name}</span>
                  {it.note && <span className="shop__desc">{it.note}</span>}
                </li>
              ))}
            </ul>
          )}

          {current.id === 'characters' || current.id === 'wardrobe' ? (
            <p className="hint shop__foot">
              {current.id === 'wardrobe' && !look ? 'Pick a character in the Locker to wear these in games · ' : ''}
              Everything you own is in your <Link to="/locker">Locker</Link> · win matches for chips
            </p>
          ) : (
            <p className="hint shop__foot">Coming to the shop · prices may change before it opens</p>
          )}
        </section>
      </main>

      {flights.map((f) => (
        <span
          key={f.id}
          className="shop__fly"
          aria-hidden="true"
          style={{ left: f.x, top: f.y, '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, animationDelay: `${f.delay}ms` } as CSSProperties}
        >
          <Chip v={f.v} size={28} />
        </span>
      ))}
    </div>
  )
}
