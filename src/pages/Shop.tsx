import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Chip, ChipStack } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { CREW_STYLES, OpsFace, priceOf, setCrewLook, useCrewLook, type OpsStyle } from '../components/OpsFace'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { buyLook, chipsFor, keepWornLook, ownsLook, useWallet, type ChipValue } from '../match/chips'
import { SHELVES, type ShelfId } from '../match/shop'
import '../styles/lobby.css'
import '../styles/shop.css'

/**
 * The shop (/shop): spend chips on looks. Your pile sits at the top; each shelf is a tab. Characters
 * are on sale now: Buy (with a check first), then Wear. Paying sends chips flying from your pile onto
 * the item. The other shelves show what's coming and what it will cost.
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
  const [shelf, setShelf] = useState<ShelfId>(() => {
    try {
      return (sessionStorage.getItem(SHELF_KEY) as ShelfId | null) ?? 'characters'
    } catch {
      return 'characters'
    }
  })
  const [confirm, setConfirm] = useState<OpsStyle | null>(null)
  const [busy, setBusy] = useState<OpsStyle | null>(null)
  const [error, setError] = useState<{ look: OpsStyle; msg: string } | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [justBought, setJustBought] = useState<OpsStyle | null>(null)
  const pileRef = useRef<HTMLSpanElement>(null)
  const cardRefs = useRef<Partial<Record<OpsStyle, HTMLElement | null>>>({})

  const owns = (l: OpsStyle) => ownsLook(wallet?.owned, l)
  const current = SHELVES.find((s) => s.id === shelf) ?? SHELVES[0]

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
  const fly = (l: OpsStyle) => {
    const from = pileRef.current?.getBoundingClientRect()
    const to = cardRefs.current[l]?.getBoundingClientRect()
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const vs = chipsFor(priceOf(l), 6)
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

  const buy = async (l: OpsStyle) => {
    setConfirm(null)
    setError(null)
    setBusy(l)
    const res = await buyLook(l)
    setBusy(null)
    if (res === 'ok') {
      fly(l)
      setJustBought(l)
      setTimeout(() => setJustBought(null), 1800)
      setTimeout(() => play('findBig'), 650)
      setCrewLook(l)
    } else {
      play('error')
      setError({ look: l, msg: res === 'short' ? 'Not enough chips yet.' : 'Couldn’t buy right now. Check your connection and try again.' })
    }
  }

  const wear = (l: OpsStyle) => {
    if (l === look) return
    play('tap')
    setCrewLook(l)
  }

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
            <button key={s.id} type="button" role="tab" aria-selected={s.id === shelf} aria-label={s.soon ? `${s.name} (coming soon)` : undefined} className={`shop__tab${s.soon ? ' shop__tab--soon' : ''}`} onClick={() => pickShelf(s.id)}>
              {s.name}
            </button>
          ))}
        </nav>

        <section className="shop__shelf" role="tabpanel" aria-label={current.name}>
          <p className="shop__blurb">{current.blurb}</p>

          {current.id === 'characters' ? (
            <ul className="shop__grid">
              {CREW_STYLES.map((s) => {
                const price = priceOf(s.id)
                const mine = owns(s.id) || s.id === look
                const wearing = s.id === look
                const asking = confirm === s.id
                const need = wallet ? price - wallet.chips : 0
                return (
                  <li
                    key={s.id}
                    ref={(el) => {
                      cardRefs.current[s.id] = el
                    }}
                    className={`shop__item${wearing ? ' shop__item--wearing' : ''}${!mine ? ' shop__item--locked' : ''}${justBought === s.id ? ' shop__item--new' : ''}`}
                  >
                    {wearing && <span className="stamp stamp--live shop__stamp">Wearing</span>}
                    {!mine && (
                      <span className="shop__price">
                        <Chip v={25} size={16} /> {price.toLocaleString()}
                      </span>
                    )}
                    {mine && !wearing && <span className="shop__owned">{price ? 'Owned' : 'Free'}</span>}
                    <OpsFace look={s.id} mood={justBought === s.id ? 'win' : 'idle'} size={84} />
                    <span className="shop__name">{s.name}</span>
                    <span className="shop__desc">{short(s.blurb)}</span>
                    <div className="shop__act">
                      {wearing ? (
                        <span className="shop__note">On your score card</span>
                      ) : mine ? (
                        <button type="button" className="btn" onClick={() => wear(s.id)}>
                          Wear
                        </button>
                      ) : !wallet ? (
                        <span className="shop__note">…</span>
                      ) : asking ? (
                        <div className="shop__confirm">
                          <span>
                            Spend <b>{price.toLocaleString()}</b>?
                          </span>
                          <button type="button" className="btn btn--primary" onClick={() => buy(s.id)}>
                            Buy
                          </button>
                          <button type="button" className="shop__cancel" onClick={() => setConfirm(null)}>
                            Not now
                          </button>
                        </div>
                      ) : need > 0 ? (
                        <span className="shop__note">{need.toLocaleString()} more to go</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={busy !== null}
                          onClick={() => {
                            play('tap')
                            setError(null)
                            setConfirm(s.id)
                          }}
                        >
                          {busy === s.id ? 'Buying…' : 'Buy'}
                        </button>
                      )}
                    </div>
                    {error?.look === s.id && <span className="error-text shop__error">{error.msg}</span>}
                  </li>
                )
              })}
            </ul>
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

          {current.id === 'characters' ? (
            <p className="hint shop__foot">
              See every face in the <Link to="/locker">Locker</Link> · win matches for chips
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
