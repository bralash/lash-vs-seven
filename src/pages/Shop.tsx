import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Chip, ChipStack } from '../components/Chip'
import { ArrowLeft } from '../components/Icons'
import { CREW_STYLES, OpsFace, priceOf, setCrewLook, useCrewLook, type OpsStyle } from '../components/OpsFace'
import { ITEMS, SLOTS, setWorn, useWear, type ItemId } from '../components/faces/wardrobe'
import { TopBar } from '../components/TopBar'
import { useSound } from '../lib/sound'
import { buyExtra, buyItem, buyLook, chipsFor, keepWornLook, ownsExtra, ownsItem, ownsLook, useWallet, type ChipValue } from '../match/chips'
import { PACKS, StickerArt } from '../match/Reactions'
import { isNew, SHELVES, type ShelfId } from '../match/shop'
import { ItemArt, launch, ownThrow, setThrowPick, SHOP_THROWS, Splat, ThrowLayer, useHit, useThrowPick, type Item } from '../match/Throws'
import '../styles/lobby.css'
import '../styles/match.css'
import '../styles/shop.css'
import { PlayerCode } from '../components/PlayerCode'
import { KEYS, load } from '../lib/storage'
import { Confetti } from '../match/Confetti'
import { asFlair, FLAIR, setFlairOn, setWinPick, useMyFlair, useWinPick, WINS, type WinId } from '../match/flair'
import { WinArt } from '../match/WinArt'

/**
 * The shop (/shop): spend chips on looks. Your pile sits at the top; each shelf is a tab. Characters
 * and the wardrobe are on sale: Buy (with a check first), and paying sends chips flying from your pile
 * onto the item, which goes straight on. Then Wear / Put on / Take off. Throwables can be tried for
 * free (tap the face and one comes flying at it); sticker packs show their six. The other shelves
 * show what's coming and what it will cost. What you own is also in the Locker.
 */

/** the first sentence of a character's blurb */
const short = (s: string) => s.split(/(?<=\.)\s/)[0]
const SHELF_KEY = 'lvs_shop_shelf'
/** what each character throws, for the "your own throw" card */
const OWN_NAME: Partial<Record<Item, string>> = { axe: 'his axe', stone: 'a stone', web: 'a ball of web', cube: 'an Energon cube', rubble: 'rubble', flash: 'a flashbang', gum: 'a ball of gum', coins: 'small-small coins', batarang: 'a batarang', stool: 'an Asante stool', book: 'a Free SHS textbook' }
const JUNK: Item[] = ['tomato', 'rock', 'paper']

/** a face to throw at, on a throwable's card: tap it and one comes flying from the bottom of the screen */
function Target({ id, item, look, wear, onThrow }: { id: string; item: () => Item; look: OpsStyle; wear: ItemId[]; onThrow: () => void }) {
  const hit = useHit(id)
  return (
    <button
      type="button"
      className="shop__try"
      aria-label="Try it: throw one at this face"
      onClick={() => {
        onThrow()
        launch(null, id, item())
      }}
    >
      <span className={`mt-score__ops${hit ? ` mt-score__ops--hit mt-score__ops--${hit.item}` : ''}`} data-ops-face={id}>
        <span>
          <OpsFace look={look} mood={hit ? 'ouch' : 'idle'} size={64} wear={wear} />
        </span>
        {hit && <Splat key={hit.n} hit={hit} />}
      </span>
      <span className="shop__try-tag">Tap to try</span>
    </button>
  )
}

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
  const throwPick = useThrowPick()
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
  /** a shelf's tab says New while something on it is new and not yours yet */
  const o = wallet?.owned
  const unownedNew: Partial<Record<ShelfId, boolean>> = {
    characters: CREW_STYLES.some((s) => isNew(s.id) && !ownsLook(o, s.id)),
    wardrobe: ITEMS.some((it) => !it.prize && isNew(it.id) && !ownsItem(o, it.id)),
    throws: SHOP_THROWS.some((t) => isNew(t.id) && !ownsExtra(o, t.id)),
    stickers: PACKS.some((p) => isNew(p.id) && !ownsExtra(o, p.id)),
    wins: WINS.some((w) => isNew(w.id) && !ownsExtra(o, w.id)),
    flair: FLAIR.some((f) => isNew(f.id) && !ownsExtra(o, f.id)),
  }
  const winPick = useWinPick()
  const myFlair = useMyFlair()
  /** a win being shown (Tap to see), until it's played out */
  const [trying, setTrying] = useState<{ win: WinId | null; n: number } | null>(null)
  useEffect(() => {
    if (!trying) return
    const id = setTimeout(() => setTrying(null), 4500)
    return () => clearTimeout(id)
  }, [trying])
  const shelfNew = (id: ShelfId) => !!unownedNew[id]
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
      {!o.mine && isNew(id) && <span className="shop__new">New</span>}
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
        {ITEMS.filter((it) => it.slot === slot.id && !it.prize).map((it) => {
          const on = wear.includes(it.id)
          const mine = ownsItem(wallet?.owned, it.id) || on
          // nothing picked yet: putting something on picks Bot (who it's shown on), so you see it
          const wearIt = (id: ItemId) => {
            if (!look) setCrewLook(model)
            setWorn(id, true)
          }
          const toggle = (id: ItemId, v: boolean) => (play('tap'), v ? wearIt(id) : setWorn(id, false))
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
              buyArea(it.id, it.price, () => buy(it.id, it.price, () => buyItem(it.id), () => wearIt(it.id)))
            ),
          })
        })}
      </ul>
    </div>
  ))

  const lookName = CREW_STYLES.find((s) => s.id === look)?.name
  const own = ownThrow(look)
  const throws = (
    <ul className="shop__grid">
      {card('own', {
        price: 0,
        mine: true,
        on: throwPick === null,
        onLabel: 'Throwing',
        face: <Target id="try-own" item={() => own ?? JUNK[Math.floor(Math.random() * JUNK.length)]} look={model} wear={wear} onThrow={() => play('whoosh')} />,
        name: 'Your own throw',
        desc: own && lookName ? `${lookName} throws ${OWN_NAME[own]}.` : 'A tomato, a rock or a paper ball: whatever’s to hand.',
        act:
          throwPick === null ? (
            <span className="shop__note">What you throw now</span>
          ) : (
            <button type="button" className="btn" onClick={() => (play('tap'), setThrowPick(null))}>
              Throw this
            </button>
          ),
      })}
      {SHOP_THROWS.map((t) => {
        const on = throwPick === t.id
        const mine = ownsExtra(wallet?.owned, t.id) || on
        return card(t.id, {
          price: t.price,
          mine,
          on,
          onLabel: 'Throwing',
          face: (
            <span className="shop__throw-face">
              <ItemArt item={t.id} size={40} />
              <Target id={`try-${t.id}`} item={() => t.id} look={model} wear={wear} onThrow={() => play('whoosh')} />
            </span>
          ),
          name: t.name,
          desc: t.blurb,
          act: on ? (
            <span className="shop__note">What you throw now</span>
          ) : mine ? (
            <button type="button" className="btn" onClick={() => (play('tap'), setThrowPick(t.id))}>
              Throw this
            </button>
          ) : (
            buyArea(t.id, t.price, () => buy(t.id, t.price, () => buyExtra(t.id, t.price), () => setThrowPick(t.id)))
          ),
        })
      })}
    </ul>
  )

  const stickers = (
    <ul className="shop__grid shop__grid--packs">
      {PACKS.map((pk) => {
        const mine = ownsExtra(wallet?.owned, pk.id)
        return card(pk.id, {
          price: pk.price,
          mine,
          on: false,
          onLabel: '',
          face: (
            <span className="shop__pack" aria-label={pk.stickers.map((x) => x.label).join(', ')}>
              {pk.stickers.map((x) => (
                <span key={x.k} className="shop__sticker">
                  <StickerArt s={x} who={{ look: model, wear: look ? wear : undefined }} size={'faces' in pk ? 34 : 24} />
                  <small>{x.label}</small>
                </span>
              ))}
            </span>
          ),
          name: pk.name,
          desc:
            'faces' in pk
              ? mine
                ? 'Your character pulls the face, on everyone’s screen.'
                : 'Six stickers where your own character pulls the face. Any character from the shop; the free robots send the emoji.'
              : mine
                ? 'In your reactions tray, on its own tab.'
                : 'Six reactions for the tray.',
          act: mine ? <span className="shop__note">In your tray</span> : buyArea(pk.id, pk.price, () => buy(pk.id, pk.price, () => buyExtra(pk.id, pk.price), () => {})),
        })
      })}
    </ul>
  )

  const wins = (
    <ul className="shop__grid">
      {[{ id: null, name: 'Confetti', price: 0, blurb: 'The burst of paper everyone gets.' }, ...WINS].map((w) => {
        const id = w.id ?? 'confetti'
        const on = winPick === w.id
        const mine = w.id === null || ownsExtra(wallet?.owned, w.id) || on
        return card(id, {
          price: w.price,
          mine,
          on,
          onLabel: 'On',
          face: (
            <button type="button" className="shop__try shop__win-try" aria-label={`See ${w.name}`} onClick={() => (play('tap'), setTrying({ win: w.id, n: Date.now() }))}>
              <WinArt id={w.id} />
              <span className="shop__try-tag">Tap to see</span>
            </button>
          ),
          name: w.name,
          desc: w.blurb,
          act: on ? (
            <span className="shop__note">Plays when you win</span>
          ) : mine ? (
            <button type="button" className="btn" onClick={() => (play('tap'), setWinPick(w.id))}>
              Use this
            </button>
          ) : (
            buyArea(id, w.price, () => buy(id, w.price, () => buyExtra(id, w.price), () => setWinPick(w.id)))
          ),
        })
      })}
    </ul>
  )

  const myName = load(KEYS.name) || 'You'
  const flairShelf = (['frame', 'title', 'gold'] as const).map((kind) => (
    <div key={kind} className="shop__slot">
      <h3 className="shop__slot-h">{kind === 'frame' ? 'Frames' : kind === 'title' ? 'Titles' : 'Your name'}</h3>
      <ul className="shop__grid">
        {FLAIR.filter((f) => f.kind === kind).map((f) => {
          const on = myFlair.includes(f.id)
          const mine = ownsExtra(wallet?.owned, f.id) || on
          const fl = asFlair(f.id)
          return card(f.id, {
            price: f.price,
            mine,
            on,
            onLabel: 'On',
            face: (
              <span className="shop__flair" aria-hidden="true">
                <span className={`mt-score mt-score--0 mt-score--you${fl.frame ? ` mt-score--frame mt-score--${fl.frame}` : ''}`}>
                  {fl.title && <span className="mt-score__title">{fl.title}</span>}
                  <span className={`mt-score__name${fl.gold ? ' mt-score__name--gold' : ''}`}>{myName}</span>
                  <span className="mt-score__n">3</span>
                </span>
              </span>
            ),
            name: f.name,
            desc: f.blurb,
            act: on ? (
              <button type="button" className="btn" onClick={() => (play('tap'), setFlairOn(f.id, false))}>
                Take off
              </button>
            ) : mine ? (
              <button type="button" className="btn" onClick={() => (play('tap'), setFlairOn(f.id, true))}>
                Put on
              </button>
            ) : (
              buyArea(f.id, f.price, () => buy(f.id, f.price, () => buyExtra(f.id, f.price), () => setFlairOn(f.id, true)))
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
        <PlayerCode />

        <nav className="shop__tabs" role="tablist" aria-label="Shelves">
          {SHELVES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === shelf}
              aria-label={s.soon ? `${s.name} (coming soon)` : shelfNew(s.id) ? `${s.name} (something new)` : undefined}
              className={`shop__tab${s.soon ? ' shop__tab--soon' : ''}`}
              onClick={() => pickShelf(s.id)}
            >
              {s.name}
              {shelfNew(s.id) && (
                <span className="shop__tab-new" aria-hidden="true">
                  New
                </span>
              )}
            </button>
          ))}
        </nav>

        <section className="shop__shelf" role="tabpanel" aria-label={current.name}>
          <p className="shop__blurb">{current.blurb}</p>

          {current.id === 'characters' ? (
            characters
          ) : current.id === 'wardrobe' ? (
            wardrobe
          ) : current.id === 'throws' ? (
            throws
          ) : current.id === 'stickers' ? (
            stickers
          ) : current.id === 'wins' ? (
            wins
          ) : current.id === 'flair' ? (
            flairShelf
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

          {!current.soon ? (
            <p className="hint shop__foot">
              {current.id === 'wardrobe' && !look ? 'Putting something on picks Bot for you (change it in the Locker) · ' : ''}
              Everything you own is in your <Link to="/locker">Locker</Link> · win matches for chips
            </p>
          ) : (
            <p className="hint shop__foot">Coming to the shop · prices may change before it opens</p>
          )}
        </section>
      </main>

      <ThrowLayer me="shop" view />
      {trying && <Confetti key={trying.n} win={trying.win} />}
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
