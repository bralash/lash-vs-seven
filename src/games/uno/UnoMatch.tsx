import { ref, runTransaction, set, update } from 'firebase/database'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/firebase'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { roomPath, seatedPlayers, stillIn, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { MatchEnded } from '../../match/MatchEnded'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession, useVsOps } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import type { CardInput, SeatN } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useAwayPlayers } from '../../match/useOpponentAway'
import { useRivalryMulti } from '../../match/useRivalry'
import { ColourPick, UnoBack, UnoCard, UnoHand } from './Cards'
import { lockCards, newKey, openCard, readCard, relock, strip, verify } from './deal'
import {
  COLOUR_NAMES,
  DECK,
  callUno,
  cardLabel,
  catchUno,
  chainOf,
  countOf,
  dealOpen,
  draw,
  drop,
  fits,
  forfeit,
  freshLive,
  fullDeck,
  isWild,
  keep,
  lockingPile,
  parseSlot,
  play,
  playable,
  playsOf,
  postLock,
  postStrip,
  reqDone,
  reqsOf,
  revealKeys,
  shuffled,
  sk,
  stockLeft,
  topOf,
  waitingOn,
  type Live,
  type Pile,
} from './engine'
import '../../styles/spar.css'
import '../../styles/uno.css'

const GAME = 'uno'
/** The last card stays up this long before the results. */
const RESULT_MS = 2600

/** Online only: each pile as the phones lock it (`d`), and each request's cards as the phones unlock them (`r`). */
export interface Vault {
  d?: Record<string, Record<string, string[]>>
  r?: Record<string, Record<string, string[]>>
}
/**
 * The room's live state: the game itself (`g`, small, changed in transactions) and next to it the
 * vault of locked cards (`v`, by deal), written once per step and never sent with every move.
 */
export interface Wrap {
  g: Live
  v?: Record<string, Vault>
}
export interface UnoState {
  match: number
  live: Wrap
  ready?: Record<string, boolean>
}

/** `seats`: who's playing, in seat order. The first player moves one seat round the table each match. */
export function initialUnoState(match = 1, seats: number[] = [0, 1]): UnoState {
  return { match, live: { g: freshLive(seats, seats[(match - 1) % seats.length]) } }
}

/* ── This deal's keys (one per pile): only ever on this device ──────── */
const keySlot = (id: string) => `lvs_uno:${id}`
function loadKey(id: string): string | null {
  try {
    return sessionStorage.getItem(keySlot(id))
  } catch {
    return null
  }
}
function saveKey(id: string, k: string) {
  try {
    sessionStorage.setItem(keySlot(id), k)
  } catch {
    /* storage blocked: the key lives in memory for this page only */
  }
}

type Chore = { sig: string; kind: 'lock'; p: number; L: number } | { sig: string; kind: 'strip'; ids: number[] } | { sig: string; kind: 'reveal' }

export function UnoMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as UnoState
  const g = st.live.g
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const local = session.local
  // against Ops there's no other phone to keep secrets from: deal on this device, like pass & play
  // (her brain only ever reads her own hand)
  const vsOps = useVsOps()
  const open = local || vsOps
  const players = seatedPlayers(room)
  const many = players.filter(Boolean).length > 2
  const name = (s: number) => players[s]?.name ?? `Player ${s + 1}`
  const mine = (s: number) => !local && s === me.seatN
  const nm = (s: number) => (mine(s) ? 'You' : name(s))
  // whose cards are on screen: online that's you; on one device it's whoever's turn it is
  const view = local ? g.turn : me.seatN
  const seats = g.seats

  const over = g.phase === 'done'
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const others = open ? [] : stillIn(room).filter((p) => p.id !== me.id)
  const away = useAwayPlayers(GAME, room.code, others, inMatch)
  const carryOn = others.length >= 2

  /** change the game: in a transaction on live/g online (the vault isn't sent), in memory on one device */
  const base = `${roomPath(GAME, room.code)}/state/live`
  const moveG = useCallback(
    (m: (g: Live) => Live | undefined): Promise<boolean> =>
      open
        ? session.move<Wrap>((w) => {
            const n = m(w.g)
            return n ? { ...w, g: n } : undefined
          })
        : runTransaction(ref(db, `${base}/g`), (cur: Live | null) => {
            if (cur === null) return cur
            // the database takes no undefined: drop those fields (an engine "not set" is the same as missing)
            const n = m(cur)
            return n === undefined ? undefined : (JSON.parse(JSON.stringify(n)) as Live)
          }).then((r) => r.committed),
    [open, session, base],
  )

  // someone left the room (or dropped): deal again without them. Any phone can; it only lands once.
  const outKey = Object.keys(room.out ?? {}).join(',')
  useEffect(() => {
    for (const s of seats) {
      const p = players[s]
      if (p && room.out?.[p.id]) moveG((cur) => drop(cur, s)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outKey, seats.join(','), moveG])

  /* ── keys and the vault ── */
  const roundId = `${room.code}:${room.createdAt}:${st.match}:${g.deal}`
  const memKeys = useRef<Record<string, string>>({})
  const getKey = (p: number, create: boolean) => {
    const id = `${roundId}:p${p}`
    let k = memKeys.current[id] ?? loadKey(id)
    if (!k && create) {
      k = newKey()
      saveKey(id, k)
    }
    if (k) memKeys.current[id] = k
    return k
  }
  const vault: Vault = st.live.v?.[`x${g.deal}`] ?? {}
  const chain = chainOf(g)
  const piles: Pile[] = g.piles ?? [{ size: DECK, locked: 0 }]
  const reqs = reqsOf(g)
  const deckAt = (p: number, L: number) => vault.d?.[`p${p}`]?.[`l${L}`]
  const finalDeck = (p: number) => deckAt(p, chain.length)
  /** a request's cards as they stand (after however many phones have unlocked them) */
  const stage = (id: number): string[] | undefined => {
    const r = reqs[id]
    const k = r.k ?? 0
    if (k > 0) return vault.r?.[`q${id}`]?.[`k${k}`]
    const out = r.slots.map((sl) => {
      const [p, i] = parseSlot(sl)
      return finalDeck(p)?.[i]
    })
    return out.every(Boolean) ? (out as string[]) : undefined
  }
  const myPos = chain.indexOf(view)
  // my lock is on a pile, but the key that takes it off isn't on this device
  const lost = !open && g.phase !== 'done' && myPos >= 0 && piles.some((pl, p) => myPos < (pl.locked ?? 0) && !getKey(p, false))

  /* ── this phone's part: lock a pile, unlock others' cards, show my keys at the end ── */
  const chore: Chore | null = (() => {
    if (open || myPos < 0 || lost || session.watching) return null
    if (g.phase !== 'done') {
      const lp = lockingPile({ ...g, piles })
      if (lp >= 0) {
        const L = piles[lp].locked ?? 0
        if (chain[L] === view && (L === 0 || deckAt(lp, L))) return { sig: `lock:${g.deal}:${lp}:${L}`, kind: 'lock', p: lp, L }
      }
      const ids = waitingOn(g, view).filter((id) => stage(id))
      if (ids.length) return { sig: `strip:${g.deal}:${ids.map((id) => `${id}.${reqs[id].k ?? 0}`).join(',')}`, kind: 'strip', ids }
      return null
    }
    if (!g.keys?.[sk(view)] && piles.every((_, p) => getKey(p, false))) return { sig: `reveal:${g.deal}`, kind: 'reveal' }
    return null
  })()
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!chore) return
    let alive = true
    const seat = view
    const run = async (): Promise<boolean> => {
      if (chore.kind === 'lock') {
        const k = getKey(chore.p, true)!
        const prev = deckAt(chore.p, chore.L)
        const deck = chore.L === 0 ? lockCards(chore.p === 0 ? fullDeck() : (piles[chore.p].cards ?? []), k) : relock(prev!, k)
        await set(ref(db, `${base}/v/x${g.deal}/d/p${chore.p}/l${chore.L + 1}`), deck)
        return moveG((cur) => postLock(cur, seat, chore.p))
      }
      if (chore.kind === 'strip') {
        const updates: Record<string, string[]> = {}
        let start: number | undefined
        for (const id of chore.ids) {
          const r = reqs[id]
          const before = stage(id)!
          const after = r.slots.map((sl, j) => strip([before[j]], getKey(parseSlot(sl)[0], false)!)[0])
          updates[`v/x${g.deal}/r/q${id}/k${(r.k ?? 0) + 1}`] = after
          if (r.to === -1 && (r.need ?? []).length === 1) start = openCard(after[0])
        }
        await update(ref(db, base), updates)
        return moveG((cur) => postStrip(cur, seat, chore.ids, start))
      }
      const keys = piles.map((_, p) => getKey(p, false)!)
      return moveG((cur) => revealKeys(cur, seat, keys))
    }
    // a beat first, so the screen paints before the number crunching
    const t = setTimeout(() => {
      run()
        .catch(() => false)
        .then((ok) => {
          if (!ok && alive) setTimeout(() => alive && setRetry((x) => x + 1), 1500)
        })
    }, 60)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chore?.sig, retry])

  // one device: deal in the open
  useEffect(() => {
    if (!open || g.phase !== 'deal') return
    const deck = shuffled(fullDeck())
    moveG((cur) => dealOpen(cur, deck)).catch(() => {})
  }, [open, g.phase, g.deal, moveG])

  // waiting on another phone: say so if it's slow
  const progress = `${g.deal}:${piles.map((p) => p.locked ?? 0).join('.')}:${reqs.map((r) => r.k ?? 0).join('.')}`
  const blocking = (() => {
    if (open) return null
    const lp = lockingPile({ ...g, piles })
    if (lp >= 0) return chain[piles[lp].locked ?? 0]
    const r = reqs.find((x) => !reqDone(x))
    return r ? (r.need ?? [])[0] : null
  })()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (blocking === null || blocking === undefined || g.phase === 'done') return
    const t = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(t)
  }, [progress, blocking, g.phase])

  /* ── my cards ── */
  const decoded = useRef(new Map<string, number>())
  const slotReq = useMemo(() => {
    const m = new Map<string, number>()
    reqs.forEach((r, id) => r.slots.forEach((sl) => m.set(sl, id)))
    return m
  }, [reqs])
  let cards: { key: string; c: number }[] = []
  let pending = 0
  if (open) cards = (g.hands?.[view] ?? []).map((c) => ({ key: `c${c}`, c }))
  else
    for (const slot of g.held?.[sk(view)] ?? []) {
      const memo = decoded.current.get(`${g.deal}:${slot}`)
      if (memo !== undefined) {
        cards.push({ key: slot, c: memo })
        continue
      }
      const id = slotReq.get(slot)
      const r = id === undefined ? undefined : reqs[id]
      const v = r && reqDone(r) ? vault.r?.[`q${id}`]?.[`k${r.k ?? 0}`]?.[r.slots.indexOf(slot)] : undefined
      const key = getKey(parseSlot(slot)[0], false)
      const c = v && key ? readCard(v, key) : undefined
      if (c === undefined) pending++
      else {
        decoded.current.set(`${g.deal}:${slot}`, c)
        cards.push({ key: slot, c })
      }
    }
  cards = cards.sort((a, b) => a.c - b.c)
  const drawnKey = g.drew === view && g.drawn !== null && g.drawn !== undefined ? (open ? `c${g.drawn}` : String(g.drawn)) : null
  const drawnCard = drawnKey ? (cards.find((x) => x.key === drawnKey)?.c ?? null) : null
  const legalCards = playable(g, view, cards.map((x) => x.c), drawnCard)
  const legal = cards.filter((x) => legalCards.includes(x.c) && (!drawnKey || x.key === drawnKey)).map((x) => x.key)

  /* ── playing ── */
  const myTurn = g.phase === 'play' && g.turn === view && !lost
  const [picked, setPicked] = useState<string | null>(null)
  const [wildFor, setWildFor] = useState<{ key: string; c: number } | null>(null)
  const [stuck, setStuck] = useState(false)
  const plays = playsOf(g)
  useEffect(() => {
    setPicked(null)
    setWildFor(null)
    setStuck(false)
  }, [plays.length, g.turn, g.deal, g.drew])
  const doPlay = (key: string, c: number, col?: number) => {
    setPicked(null)
    setWildFor(null)
    moveG((cur) => play(cur, view, c, { slot: open ? undefined : key, col })).catch(() => {})
  }
  const pick = (key: string, c: number) => {
    sound('tap')
    if (picked !== key) return setPicked(key)
    if (isWild(c)) return setWildFor({ key, c })
    doPlay(key, c)
  }
  const doDraw = () => {
    sound('tap')
    moveG((cur) => draw(cur, view))
      .then((ok) => setStuck(!ok && lockingPile({ ...g, piles }) >= 0))
      .catch(() => {})
  }
  const owe = g.owe ?? 0
  const canDraw = myTurn && g.drew !== view && (open || !pending)

  // online, a card drawn that can't go on the pile is kept after a moment
  useEffect(() => {
    if (open || g.drew !== view || g.turn !== view || drawnCard === null || fits(g, drawnCard)) return
    const t = setTimeout(() => moveG((cur) => keep(cur, view)).catch(() => {}), 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, g.drew, g.turn, drawnCard, view])

  // sounds: what just happened
  const lastSig = `${g.deal}:${plays.length}:${JSON.stringify(g.last ?? null)}`
  const seenRef = useRef(lastSig)
  useEffect(() => {
    if (seenRef.current === lastSig) return
    seenRef.current = lastSig
    const l = g.last
    if (g.phase === 'done') sound(local || g.winner === me.seatN ? 'findBig' : 'end')
    else if (!l) return
    else if (l.what === 'play') sound('snap')
    else if (l.what === 'catch') sound('buzz')
    else if (l.what === 'uno') sound('horn')
    else if (l.what === 'owe' && (l.n ?? 0) >= 4) sound('splat')
    else sound('tick')
  }, [lastSig, g.last, g.phase, g.winner, me.seatN, local, sound])

  /* ── the end-of-round check, once every key is out ── */
  const [check, setCheck] = useState<{ ok: true } | { ok: false; msg: string } | null>(null)
  const allKeys = chain.every((s) => g.keys?.[sk(s)])
  const keyGone = over && !allKeys ? chain.find((s) => !g.keys?.[sk(s)] && players[s] && room.out?.[players[s]!.id]) : undefined
  useEffect(() => {
    setCheck(null)
    if (open || g.phase !== 'done' || !allKeys) return
    let alive = true
    const t = setTimeout(() => {
      const keys: Record<number, string[]> = {}
      for (const s of chain) keys[s] = g.keys![sk(s)]
      const bad = verify({
        piles,
        decks: piles.map((_, p) => finalDeck(p) ?? []),
        reqs: reqs.map((req, id) => ({ req, cards: reqDone(req) ? (vault.r?.[`q${id}`]?.[`k${req.k ?? 0}`] ?? null) : null })),
        plays,
        chain,
        keys,
      })
      if (!alive) return
      setCheck(bad ? { ok: false, msg: `${name(bad.s)}: ${bad.why}.` } : { ok: true })
    }, 150)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, g.phase, allKeys, roundId])
  const checkLine = open
    ? null
    : keyGone !== undefined
      ? `${name(keyGone)} left before showing their keys, so this deal can’t be checked.`
      : check === null
        ? 'Checking the deal…'
        : check.ok
          ? `✓ Fair deal: every shuffle and every card played checked`
          : check.msg

  // pass & play: cover your hand whenever the phone changes hands
  const [holder, setHolder] = useState<string | null>(null)
  const holdKey = `${g.deal}:${g.turn}`
  const cover = local && inMatch && g.phase === 'play' && holder !== holdKey

  /* ── the board ── */
  const card = (s: number) => {
    const p = players[s]
    if (!p) return null
    const gone = !seats.includes(s)
    const n = countOf(g, s)
    return (
      <ScoreCard
        key={s}
        p={p}
        you={mine(s)}
        active={local && inMatch && g.turn === s}
        turn={inMatch && g.phase === 'play' && g.turn === s}
        value={gone ? 0 : n}
        meta={gone ? 'left' : n === 1 ? 'card' : 'cards'}
      />
    )
  }
  const scoreboard = many ? (
    <div className="sp-hud-many">{players.map((_, s) => card(s))}</div>
  ) : (
    <>
      {card(0)}
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      {card(1)}
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={players} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} players={players} exit={exit} checkLine={checkLine} />

  const hud = many ? <div className="sp-hud-many">{players.map((_, s) => card(s))}</div> : <div className="mt-hud">{scoreboard}</div>

  const top = topOf(g)
  const under = (g.discard ?? []).at(-2)
  const catchable = g.phase === 'play' && g.uno !== null && g.uno !== undefined && g.uno !== view && seats.includes(view) ? g.uno : null
  const myCount = countOf(g, view)
  const unoNow = g.phase === 'play' && g.uno === view
  const unoAhead = myTurn && myCount === 2 && !(g.called ?? []).includes(view) && g.drew !== view
  const lastPlay = plays.at(-1)

  const status = (() => {
    if (g.phase === 'deal') {
      const again = g.redeal ? `Dealing again · ${name(g.redeal.who)} ${g.redeal.why === 'left' ? 'left' : 'lost their cards'}` : null
      return again ?? (open ? 'Dealing…' : 'Shuffling…')
    }
    if (g.phase === 'done') return g.winner === undefined ? '' : mine(g.winner) ? 'Uno — you’re out!' : `${name(g.winner)} is out!`
    if (!myTurn || local) {
      const who = `${name(g.turn)}’s turn`
      return owe ? `${who} · +${owe} on them` : who
    }
    if (owe) return `Stack a draw card or draw ${owe}`
    if (g.drew === view) return drawnCard === null ? 'Drawing…' : fits(g, drawnCard) ? 'Play it or keep it' : 'No luck — keeping it'
    return 'Your turn'
  })()

  const lastLine = (() => {
    const l = g.last
    if (!l || g.phase === 'deal') return null
    switch (l.what) {
      case 'play':
        return lastPlay ? `${nm(l.s)} played ${cardLabel(lastPlay.c)}${lastPlay.col !== undefined ? ` · ${COLOUR_NAMES[lastPlay.col]}` : ''}` : null
      case 'draw':
        return `${nm(l.s)} drew a card`
      case 'owe':
        return `${nm(l.s)} drew ${l.n}`
      case 'keep':
        return `${nm(l.s)} kept it`
      case 'catch':
        return `${nm(l.by ?? 0)} caught ${mine(l.s) ? 'you' : name(l.s)} without Uno · +2`
      case 'uno':
        return `${nm(l.s)}: Uno!`
      case 'dry':
        return `Nothing left to draw · ${nm(l.s)} passed`
    }
  })()

  const hint = (() => {
    if (slow && blocking !== null && blocking !== undefined && blocking !== view) return `Waiting for ${name(blocking)}’s phone…`
    if (stuck) return 'Shuffling the discards back in… try again in a moment'
    if (!myTurn) return pending ? 'Your new cards are on their way…' : ' '
    if (wildFor) return ' '
    if (picked) {
      const c = cards.find((x) => x.key === picked)?.c
      return c === undefined ? ' ' : `Tap ${cardLabel(c)} again to play it`
    }
    if (g.drew === view) return drawnCard !== null && fits(g, drawnCard) ? 'Tap it twice to play it, or keep it' : ' '
    return legal.length ? 'Tap a card to lift it' : owe ? `Nothing to stack · tap the deck to draw ${owe}` : 'Nothing fits · tap the deck to draw'
  })()

  // round the table from me, so the next to play sits first
  const ring = [...seats.slice(seats.indexOf(view) + 1), ...seats.slice(0, Math.max(0, seats.indexOf(view)))].filter((s) => s !== view)
  const opponents = g.dir === 1 ? ring : [...ring].reverse()
  const catchBtn = catchable !== null && (
    <button type="button" className="btn uno-catch" onClick={() => (sound('tap'), moveG((cur) => catchUno(cur, view, catchable)).catch(() => {}))}>
      Catch {name(catchable)}!
    </button>
  )

  return (
    <main className={`spm unom screen-in${many ? ' spm--many' : ''}`}>
      {hud}
      <p className={`sp-status${myTurn && !local ? ' sp-status--you' : ''}${g.phase === 'done' ? ' sp-status--result' : ''}`} role="status">
        {status}
      </p>

      <section className="sp-table uno-table" aria-label="Table">
        {g.phase === 'deal' && !open ? (
          <DealSteps g={g} piles={piles} name={name} slow={slow} blocking={blocking} />
        ) : (
          <>
            <div className="uno-opps">
              {opponents.map((s) => {
                const n = countOf(g, s)
                return (
                  <div key={s} className={`uno-opp uno-opp--${s}${g.turn === s && g.phase === 'play' ? ' is-turn' : ''}`}>
                    <span className="uno-opp__who">{name(s)}</span>
                    <div className="uno-opp__backs" aria-label={`${name(s)}: ${n} card${n === 1 ? '' : 's'}`}>
                      {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                        <UnoBack key={i} size="sm" />
                      ))}
                      {n > 8 && <span className="uno-opp__more">+{n - 8}</span>}
                    </div>
                    {n === 1 && <span className={`uno-opp__uno${g.uno === s ? ' uno-opp__uno--open' : ''}`}>{g.uno === s ? 'No Uno!' : 'Uno'}</span>}
                  </div>
                )
              })}
            </div>
            <div className="uno-centre">
              <button type="button" className={`uno-deck${canDraw && !cover ? ' uno-deck--go' : ''}`} disabled={!canDraw || cover} onClick={doDraw} aria-label={owe ? `Draw ${owe}` : 'Draw a card'}>
                <UnoBack size="lg" />
                <span className="uno-deck__n">{stockLeft(g)}</span>
                <span className="uno-deck__label">{owe ? `Draw ${owe}` : 'Draw'}</span>
              </button>
              <div className="uno-pile" aria-label="Discard pile">
                {under !== undefined && <UnoCard k={under} size="lg" className="uno-pile__under" />}
                {top !== undefined && <UnoCard key={`${plays.length}`} k={top} size="lg" named={isWild(top) ? g.colour : undefined} className={plays.length ? 'uno-pile__top' : ''} />}
              </div>
              <div className="uno-info">
                <span className={`uno-colour${g.colour !== null && g.colour !== undefined ? ` uno-colour--${g.colour}` : ''}`}>{g.colour !== null && g.colour !== undefined ? COLOUR_NAMES[g.colour] : 'Any'}</span>
                <span className="uno-dir" aria-label={g.dir === 1 ? 'Clockwise' : 'Anticlockwise'}>
                  {g.dir === 1 ? '↻' : '↺'}
                </span>
                {owe > 0 && <span className="uno-owe">+{owe}</span>}
              </div>
            </div>
            {lastLine && <p className="uno-last">{lastLine}</p>}
          </>
        )}
      </section>

      <div className="sp-mine uno-mine">
        {g.phase === 'done' ? (
          <div className="sp-done">{checkLine && <p className={`sp-check${check && !check.ok ? ' sp-check--bad' : ''}`}>{checkLine}</p>}</div>
        ) : lost ? (
          <div className="sp-done">
            <p className="sp-check sp-check--bad">Your cards aren’t on this device any more (the page was opened somewhere else), so you can’t play this deal.</p>
            <button type="button" className="btn" onClick={() => moveG((cur) => forfeit(cur, me.seatN)).catch(() => {})}>
              Deal again
            </button>
          </div>
        ) : cover ? (
          <div className="sp-pass">
            <p className="label">Pass the phone</p>
            <button type="button" className="btn btn--lg btn--primary" onClick={() => setHolder(holdKey)}>
              I’m {name(g.turn)} <span className="keycap">↵</span>
            </button>
            {catchBtn}
          </div>
        ) : g.phase === 'deal' ? (
          <div className="sp-hand sp-hand--waiting" aria-hidden="true" />
        ) : (
          <>
            {wildFor && <ColourPick onPick={(col) => (sound('tap'), doPlay(wildFor.key, wildFor.c, col))} onCancel={() => setWildFor(null)} />}
            {(unoNow || unoAhead || catchBtn || (g.drew === view && myTurn && drawnCard !== null && fits(g, drawnCard))) && (
              <div className="uno-actions">
                {(unoNow || unoAhead) && (
                  <button type="button" className={`btn uno-call${unoNow ? ' uno-call--now' : ''}`} onClick={() => (sound('tap'), moveG((cur) => callUno(cur, view)).catch(() => {}))}>
                    Uno!
                  </button>
                )}
                {catchBtn}
                {g.drew === view && myTurn && drawnCard !== null && fits(g, drawnCard) && (
                  <button type="button" className="btn" onClick={() => (sound('tap'), moveG((cur) => keep(cur, view)).catch(() => {}))}>
                    Keep it
                  </button>
                )}
              </div>
            )}
            <UnoHand cards={cards} pending={pending} legal={myTurn ? legal : []} enabled={myTurn && !wildFor} selected={picked} onPick={pick} />
            <p className="sp-hint">{hint}</p>
          </>
        )}
      </div>

      {away.map((a) => (
        <p key={a.id} className="mt-banner" role="status">
          {a.name} disconnected · {carryOn ? 'dealt out' : 'ending the match'} in {a.secs}s unless they’re back
        </p>
      ))}
    </main>
  )
}

function DealSteps({ g, piles, name, slow, blocking }: { g: Live; piles: Pile[]; name: (s: number) => string; slow: boolean; blocking: number | null | undefined }) {
  const chain = chainOf(g)
  const n = chain.length
  const locked = piles[0].locked ?? 0
  const reqs = reqsOf(g)
  const done = reqs.filter(reqDone).length
  const steps: [boolean, string][] = [
    [locked >= n, `Each phone locks and shuffles the deck · ${locked} of ${n}`],
    [!!reqs.length && done === reqs.length, `Each phone unlocks everyone else’s seven${reqs.length ? ` · ${done} of ${reqs.length}` : ''}`],
  ]
  const now = steps.findIndex(([d]) => !d)
  return (
    <div className="sp-deal">
      <ol className="sp-deal__steps">
        {steps.map(([d, text], i) => (
          <li key={i} className={d ? 'is-done' : i === now ? 'is-now' : ''}>
            <span className="sp-deal__mark" aria-hidden="true">{d ? '✓' : i + 1}</span>
            {text}
          </li>
        ))}
      </ol>
      <p className="sp-deal__note">{slow && blocking !== null && blocking !== undefined ? `Waiting for ${name(blocking)}’s phone…` : n === 2 ? 'Neither phone can see the other’s hand.' : 'No phone can see anyone else’s hand.'}</p>
    </div>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, players, exit, checkLine }: { room: Room; me: Me; st: UnoState; players: (Seated | null)[]; exit: MatchExit; checkLine: string | null }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const g = st.live.g
  const seats = g.seats
  const many = players.filter(Boolean).length > 2
  const winner = g.winner ?? -1
  const iWon = session.local ? winner !== -1 : winner === me.seatN
  const name = (k: number) => players[k]?.name ?? `Player ${k + 1}`

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      sound('findBig')
    }
  }, [iWon, sound])

  // a rematch is for everyone still in the room, and starts once they're all ready
  const ready = st.ready ?? {}
  const inRoom = stillIn(room)
  const others = inRoom.filter((p) => p.id !== me.id)
  const imReady = !!ready[me.id]
  const othersReady = others.length > 0 && others.every((p) => ready[p.id])
  const oppGone = room.status === 'abandoned' || !others.length || others.every((p) => !p.online)
  const dealtNext = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealtNext.current || !imReady || !othersReady) return
    dealtNext.current = true
    session.start({ ...initialUnoState(st.match + 1, inRoom.map((p) => p.seat)) })
  }, [session, me.isHost, imReady, othersReady, st.match, inRoom])

  const scores = players.map((_, s) => (s === winner ? 1 : 0))
  const rivalry = useRivalryMulti(GAME, room, me, players, scores, seats, st.match)
  const left = (s: number) => countOf(g, s)
  const standing = [...seats].sort((a, b) => (a === winner ? -1 : b === winner ? 1 : left(a) - left(b)))
  const gone = players.flatMap((p, k) => (p && !seats.includes(k) ? [k] : []))
  const scoreLine = standing.map(left).join(' — ')
  const cardPlayers = players.flatMap((p, k) =>
    p ? [{ name: p.name, seat: k as SeatN, score: seats.includes(k) ? String(left(k)) : '–', meta: !seats.includes(k) ? 'left' : k === winner ? 'out first' : 'cards left' }] : [],
  )
  const card: CardInput = {
    game: 'Uno',
    winner: cardPlayers.findIndex((p) => p.seat === winner),
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: cardPlayers,
    detail: { kind: 'rounds', rows: standing.map((k) => ({ word: k === winner ? 'Out' : `${left(k)} left`, seat: k as SeatN, note: name(k) })) },
  }
  const message = many ? multiMessage(standing.map(name), winner === -1 ? null : name(winner)) : shareMessage('Uno', GAME, [name(0), name(1)], winner, scoreLine)

  return (
    <main className="spm spm-results screen-in">
      {iWon && <Confetti />}
      <div className="spm-results__head">
        <ResultMark winner={(winner < 2 ? winner : -1) as 0 | 1 | -1} />
        <p className="label">
          Match {st.match} · Uno{many ? ` · ${players.filter(Boolean).length} players` : ''}
        </p>
        <h1 className={`spm-results__title${iWon ? ' spm-results__title--win' : ''}`}>{winner === -1 ? 'No winner' : iWon && !session.local ? 'You win' : `${name(winner)} wins`}</h1>
      </div>
      <ol className="sp-standings">
        {[...standing, ...gone].map((k, i) => (
          <li key={k} className={`sp-standings__row sp-standings__row--${k}${k === winner ? ' sp-standings__row--win' : ''}`}>
            <span className="sp-standings__place">{seats.includes(k) ? i + 1 : '–'}</span>
            <span className="sp-standings__who">
              {name(k)}
              {!session.local && k === me.seatN && <em> · you</em>}
              {!seats.includes(k) && <em> · left</em>}
            </span>
            <strong>{!seats.includes(k) ? '' : k === winner ? 'Out' : `${left(k)} left`}</strong>
          </li>
        ))}
      </ol>
      {checkLine && <p className="sp-check uno-results__check">{checkLine}</p>}
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={message}
        oppName={others.map((p) => p.name).join(' & ') || undefined}
        imReady={imReady}
        oppReady={othersReady}
        oppGone={oppGone}
        onReady={() => (sound('tap'), session.ready(me.id))}
        onLeave={exit.now}
      />
    </main>
  )
}

/** The share text for a 3–4 player match, names in finishing order. */
function multiMessage(names: string[], winner: string | null) {
  const url = `${location.origin}/${GAME}`
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0])
  if (!winner) return `${list(names)} played Uno on Lash vs Seven. Your turn: ${url}`
  return `${winner} went out first at Uno against ${list(names.filter((x) => x !== winner))} on Lash vs Seven. Think you can do better? ${url}`
}
