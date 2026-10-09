import { useEffect, useMemo, useRef, useState } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { seatedPlayers, stillIn, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalryMulti } from '../../match/useRivalry'
import type { CardInput, SeatN } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession, useVsOps } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useAwayPlayers } from '../../match/useOpponentAway'
import { Backs, Card, Hand, TrickPips } from './Cards'
import { HAND, lockDeck, newKey, readHand, relockDeck, stripLocks, verifyDeal } from './deal'
import {
  TRICKS,
  SUIT_NAMES,
  byCard,
  cardLabel,
  chainOf,
  checkPlays,
  dealLocal,
  dealNo,
  dealt,
  drop,
  finishLabel,
  forfeit,
  freshLive,
  leaderOf,
  matchOver,
  nextRound,
  handTo,
  play,
  toPlay,
  playable,
  playsOf,
  postLock,
  postStrip,
  remaining,
  revealKey,
  roundSeats,
  seatsOf,
  shuffledHands,
  sk,
  suitOf,
  trickAt,
  trickWinner,
  type Live,
  type Past,
  type Play,
} from './engine'
import '../../styles/spar.css'

const GAME = 'spar'
/** The deciding trick stays up this long before the results. */
const RESULT_MS = 3200

export interface SparState {
  target: number
  match: number
  live: Live
  ready?: Record<string, boolean>
}

/** `seats`: who's playing, in seat order. The first lead moves one seat round the table each match. */
export function initialSparState(target = 10, match = 1, seats: number[] = [0, 1]): SparState {
  return { target, match, live: freshLive(target, seats, seats[(match - 1) % seats.length]) }
}

/* ── This deal's key: only ever on this device ──────────────────────── */
// sessionStorage: survives a refresh mid-round, never leaves this tab
const keySlot = (id: string) => `lvs_spar:${id}`
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

/** `seats` starting with `from`, round the table */
const rotate = (seats: number[], from: number) => {
  const i = Math.max(0, seats.indexOf(from))
  return [...seats.slice(i), ...seats.slice(0, i)]
}

export function SparMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as SparState
  const live = st.live
  const r = live.cur
  const plays = playsOf(r)
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const local = session.local
  // against Ops there's no other phone to keep secrets from: deal on this device, like pass & play
  // (Ops' brain only ever reads her own hand)
  const vsOps = useVsOps()
  const open = local || vsOps
  const players = seatedPlayers(room)
  // by who sat down, not seats: a room opened for four can start with two
  const many = players.filter(Boolean).length > 2
  const name = (s: number) => players[s]?.name ?? `Player ${s + 1}`
  const mine = (s: number) => !local && s === me.seatN
  // whose cards are on screen: online that's you; on one device it's whoever holds the phone
  const view = me.seatN
  const seats = seatsOf(live)
  const dealtIn = roundSeats(live)
  const n = dealtIn.length
  const chain = chainOf(live)

  const over = matchOver(live)
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const others = open ? [] : stillIn(room).filter((p) => p.id !== me.id)
  const away = useAwayPlayers(GAME, room.code, others, inMatch)
  // with three or more still in, someone dropping is dealt out rather than ending the match
  const carryOn = others.length >= 2

  // someone left the room (or dropped): deal them out of the match. Any phone can; it only lands once.
  const outKey = Object.keys(room.out ?? {}).join(',')
  useEffect(() => {
    for (const s of seats) {
      const p = players[s]
      if (p && room.out?.[p.id]) session.move<Live>((cur) => drop(cur, s)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outKey, seats.join(','), session])

  /* ── the key and the hand ── */
  const roundId = `${room.code}:${room.createdAt}:${st.match}:${dealNo(live)}`
  const memKeys = useRef<Record<string, string>>({})
  const getKey = (create: boolean) => {
    let k = memKeys.current[roundId] ?? loadKey(roundId)
    if (!k && create) {
      k = newKey()
      saveKey(roundId, k)
    }
    if (k) memKeys.current[roundId] = k
    return k
  }
  const myKey = open ? null : getKey(false)
  // my lock is already on the deck, but the key that takes it off isn't on this device
  const lost = !open && live.phase !== 'done' && !myKey && chain.includes(view) && chain.indexOf(view) < (r.locked ?? 0)

  const myPos = dealtIn.indexOf(view)
  const mySlots = !open && dealt(live) && myPos >= 0 ? r.dealt!.slice(myPos * HAND, myPos * HAND + HAND) : null
  const slotSig = mySlots?.join(',')
  const myCards = useMemo<number[] | null>(() => {
    if (open) return r.hands?.[view] ?? null
    return mySlots && myKey ? readHand(mySlots, myKey) : null
    // the dealt cards only change once a deal; key them by value, not by snapshot object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, r.hands, view, slotSig, myKey])
  const hand = myCards ? remaining(myCards, plays, view).sort(byCard) : []
  const legal = playable(hand, plays, n)

  /* ── the deal: each phone does its part as soon as it's its turn round the chain ── */
  const step = open || myPos < 0
    ? null
    : live.phase === 'deal'
      ? !r.dealt
        ? chain[r.locked ?? 0] === view && 'lock'
        : chain[r.stripped ?? 0] === view && 'strip'
      : live.phase === 'done' && r.forfeitBy === undefined && !r.keys?.[sk(view)] && 'reveal'
  useEffect(() => {
    if (!step) return
    // a beat first, so the screen paints before the number crunching
    const t = setTimeout(() => {
      const seat = view
      if (step === 'lock') {
        const k = getKey(true)!
        const deck = r.deck ? relockDeck(r.deck, k) : lockDeck(k)
        session.move<Live>((cur) => postLock(cur, seat, deck)).catch(() => {})
      } else if (step === 'strip' && r.dealt) {
        const k = getKey(false)
        if (!k) return
        const cards = stripLocks(r.dealt, dealtIn.indexOf(seat), k)
        session.move<Live>((cur) => postStrip(cur, seat, cards)).catch(() => {})
      } else if (step === 'reveal') {
        const k = getKey(false)
        if (k) session.move<Live>((cur) => revealKey(cur, seat, k)).catch(() => {})
      }
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, roundId, r.locked, r.stripped])

  // one device: deal in the open
  const deals = dealNo(live)
  useEffect(() => {
    if (!open || live.phase !== 'deal') return
    const hands = shuffledHands(dealtIn)
    session.move<Live>((cur) => dealLocal(cur, hands))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, live.phase, live.round, deals, session])

  // waiting on another phone during the deal: say so if it's slow
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (open || live.phase !== 'deal') return
    const t = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(t)
  }, [open, live.phase, r.locked, r.stripped, deals])

  /* ── the end-of-round check, once every key is out ── */
  const [check, setCheck] = useState<{ ok: true } | { ok: false; msg: string } | null>(null)
  const allKeys = dealtIn.every((s) => r.keys?.[sk(s)])
  // someone left before showing their key: the deal can't be checked
  const keyGone = live.phase === 'done' && !allKeys ? dealtIn.find((s) => !r.keys?.[sk(s)] && !seats.includes(s)) : undefined
  useEffect(() => {
    setCheck(null)
    if (open || live.phase !== 'done' || !allKeys || r.forfeitBy !== undefined) return
    let alive = true
    const t = setTimeout(() => {
      const v = verifyDeal({ deck: r.deck ?? [], dealt: r.dealt ?? [], keys: dealtIn.map((s) => r.keys![sk(s)]) })
      let bad: { s: number; why: string } | null = null
      if (!('error' in v)) {
        const bySeat: number[][] = []
        dealtIn.forEach((s, i) => (bySeat[s] = v.hands[i]))
        bad = checkPlays(plays, bySeat, n)
      }
      if (!alive) return
      if ('error' in v) setCheck({ ok: false, msg: 'The deal doesn’t check out — the shuffle wasn’t fair.' })
      else if (bad) setCheck({ ok: false, msg: `${name(bad.s)} ${bad.why}.` })
      else setCheck({ ok: true })
    }, 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, live.phase, allKeys, roundId])

  /* ── playing a card: tap to lift, tap again to play ── */
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [plays.length, deals])
  const canPlay = toPlay(live)
  const myTurn = canPlay.includes(view) && !!myCards
  const pick = (k: number) => {
    if (picked !== k) {
      setPicked(k)
      sound('tap')
      return
    }
    setPicked(null)
    sound('tap')
    const h = myCards ?? undefined
    session.move<Live>((cur) => play(cur, view, k, h)).catch(() => {})
  }

  // sounds: tricks won and lost, and the end of a round
  const seenRef = useRef({ n: plays.length, phase: live.phase })
  useEffect(() => {
    const seen = seenRef.current
    if (plays.length > seen.n && plays.length % n === 0) {
      const w = trickWinner(plays.slice(-n))
      if (live.phase !== 'done') sound(local || w === me.seatN ? 'find' : 'tick')
    }
    if (live.phase === 'done' && seen.phase !== 'done') {
      sound(local || r.winner === me.seatN ? 'findBig' : 'end')
    }
    seenRef.current = { n: plays.length, phase: live.phase }
  }, [plays, n, live.phase, r.winner, me.seatN, local, sound])

  // pass & play: cover your hand whenever the phone changes hands
  const [holder, setHolder] = useState<string | null>(null)
  const holdKey = `${deals}:${live.turn}`
  const cover = local && inMatch && live.phase === 'play' && holder !== holdKey

  const card = (s: number, meta: string) => {
    const p = players[s]
    if (!p) return null
    const gone = !seats.includes(s)
    return (
      <ScoreCard
        key={s}
        p={p}
        you={mine(s)}
        active={local && inMatch && canPlay.includes(s)} turn={inMatch && canPlay.includes(s)}
        value={live.scores[s] ?? 0}
        meta={gone ? 'left' : meta}
      />
    )
  }
  const scoreboard = many ? (
    <div className="sp-hud-many">{players.map((_, s) => card(s, 'points'))}</div>
  ) : (
    <>
      {card(0, 'points')}
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      {card(1, 'points')}
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={players} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} players={players} exit={exit} />

  const hud = many ? (
    <div className="sp-hud-many">{players.map((_, s) => card(s, `of ${live.target}`))}</div>
  ) : (
    <div className="mt-hud">
      {card(0, `of ${live.target}`)}
      <div className="sp-round">
        <span className="label">Round</span>
        <strong>{live.round + 1}</strong>
        <span className="sp-round__to">first to {live.target}</span>
      </div>
      {card(1, `of ${live.target}`)}
    </div>
  )

  /* ── what's on the table ── */
  const trickNo = Math.floor(plays.length / n)
  const partial = plays.length % n
  const shown: Play[] = partial ? plays.slice(plays.length - partial) : plays.slice(-n)
  const shownWinner = shown.length === n ? trickWinner(shown) : null
  const order = rotate(dealtIn, shown[0]?.s ?? live.turn)
  const winners = Array.from({ length: trickNo }, (_, t) => trickWinner(trickAt(plays, t, n)))
  const leading = partial === 0
  const ledSuit = leading ? null : suitOf(plays[plays.length - partial].c)
  const last = trickNo === TRICKS - 1

  const status = (() => {
    if (live.phase === 'deal') {
      const again = live.redeal ? `Dealing again · ${name(live.redeal.who)} ${live.redeal.why === 'left' ? 'left' : 'lost their cards'}` : null
      return again ?? (open ? 'Dealing…' : 'Shuffling…')
    }
    if (live.phase === 'done') return roundLine(live, name)
    const lastNote = last ? ' · last trick' : ''
    if (leading && (local || live.turn !== me.seatN)) return `${name(live.turn)} leads${lastNote}`
    if (!leading && (local || !canPlay.includes(me.seatN))) return `${local ? '' : 'Waiting for '}${andList(canPlay.map(name))}${local ? ' to play' : ''}${lastNote}`
    if (leading) return last ? 'Your lead · last trick' : 'Your lead'
    const canFollow = hand.some((c) => suitOf(c) === ledSuit)
    return canFollow ? `Follow ${SUIT_NAMES[ledSuit!]}` : `No ${SUIT_NAMES[ledSuit!]} — play any card`
  })()

  const youAct = live.phase === 'play' && (local ? !cover : canPlay.includes(me.seatN))
  const opponents = dealtIn.filter((s) => s !== view)

  return (
    <main className={`spm screen-in${many ? ' spm--many' : ''}`}>
      {hud}
      {many && (
        <p className="sp-roundline">
          Round {live.round + 1} · first to {live.target}
        </p>
      )}
      <p className={`sp-status${youAct ? ' sp-status--you' : ''}${live.phase === 'done' ? ' sp-status--result' : ''}`} role="status">
        {status}
      </p>

      <section className="sp-table" aria-label="Table">
        <div className={`sp-table__top${opponents.length > 1 ? ' sp-table__top--many' : ''}`}>
          {live.phase === 'deal' ? (
            <span className="label sp-table__note">Round {live.round + 1}</span>
          ) : (
            <div className="sp-opps">
              {opponents.map((s) => (
                <Backs key={s} n={TRICKS - plays.filter((p) => p.s === s).length} seat={s} name={name(s)} label={opponents.length > 1} />
              ))}
            </div>
          )}
          <TrickPips winners={winners} current={live.phase === 'play' ? trickNo : -1} />
        </div>

        {live.phase === 'deal' && !open ? (
          <DealSteps live={live} name={name} slow={slow} />
        ) : (
          <div className={`sp-trick sp-trick--${n}`}>
            {order.map((who, i) => {
              const p = shown.find((x) => x.s === who)
              const won = p && shownWinner === p.s
              return (
                <div key={i} className={`sp-slot sp-slot--${who}${won ? ' sp-slot--won' : ''}`}>
                  <span className="sp-slot__who">
                    {name(who)}
                    <em>{i === 0 ? ' · lead' : ''}</em>
                  </span>
                  {p ? <Card key={`${p.c}`} k={p.c} size="lg" className="sp-slot__card" /> : <span className="sp-slot__empty" />}
                  {won && <span className="sp-slot__stamp">{live.phase === 'done' ? 'wins' : 'takes it'}</span>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="sp-mine">
        {live.phase === 'done' ? (
          <div className="sp-done">
            {!open && r.forfeitBy === undefined && (
              <p className={`sp-check${check && !check.ok ? ' sp-check--bad' : ''}`}>
                {keyGone !== undefined
                  ? `${name(keyGone)} left before showing their key, so this deal can’t be checked.`
                  : check === null
                    ? 'Checking the deal…'
                    : check.ok
                      ? `✓ Fair deal — ${n === 2 ? 'both' : 'every'} shuffle and every card checked`
                      : check.msg}
              </p>
            )}
            {!over && (
              <button type="button" className="btn btn--primary btn--lg" onClick={() => (sound('tap'), session.move<Live>((cur) => nextRound(cur)).catch(() => {}))}>
                Next round <span className="keycap">↵</span>
              </button>
            )}
          </div>
        ) : lost ? (
          <div className="sp-done">
            <p className="sp-check sp-check--bad">Your cards aren’t on this device any more (the page was opened somewhere else), so you can’t play this round.</p>
            <button type="button" className="btn" onClick={() => session.move<Live>((cur) => forfeit(cur, me.seatN)).catch(() => {})}>
              {n === 2 ? `Give ${name(dealtIn.find((s) => s !== me.seatN)!)} the round` : 'Deal again (costs you a point)'}
            </button>
          </div>
        ) : cover ? (
          <div className="sp-pass">
            <p className="label">Pass the phone</p>
            {/* after the lead, whoever's still to play can take it, in any order */}
            {(canPlay.length > 1 ? canPlay : [live.turn]).map((s, i) => (
              <button
                key={s}
                type="button"
                className={`btn btn--lg${i === 0 ? ' btn--primary' : ''}`}
                onClick={() => {
                  setHolder(`${deals}:${s}`)
                  if (s !== live.turn) session.move<Live>((cur) => handTo(cur, s)).catch(() => {})
                }}
              >
                I’m {name(s)} {i === 0 && <span className="keycap">↵</span>}
              </button>
            ))}
          </div>
        ) : live.phase === 'deal' ? (
          <div className="sp-hand sp-hand--waiting" aria-hidden="true" />
        ) : (
          <>
            <Hand cards={hand} legal={legal} enabled={myTurn} selected={picked} onPick={pick} />
            <p className="sp-hint">{myTurn ? (picked !== null ? `Tap ${cardLabel(picked)} again to play it` : 'Tap a card to lift it') : ' '}</p>
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

function DealSteps({ live, name, slow }: { live: Live; name: (s: number) => string; slow: boolean }) {
  const r = live.cur
  const chain = chainOf(live)
  const n = chain.length
  const locked = r.locked ?? 0
  const stripped = r.dealt ? (r.stripped ?? 0) : 0
  const two = n === 2
  const steps: [boolean, string][] = two
    ? [
        [locked >= 1, `${name(chain[0])}’s phone locks and shuffles the deck`],
        [locked >= 2, `${name(chain[1])}’s phone locks it again and reshuffles`],
        [stripped >= 2, 'Each phone unlocks the other’s five cards'],
      ]
    : [
        [locked >= n, `Each phone locks and reshuffles the deck · ${locked} of ${n}`],
        [stripped >= n, `Each phone unlocks everyone else’s cards · ${stripped} of ${n}`],
      ]
  const now = steps.findIndex(([done]) => !done)
  const waitingOn = !r.dealt ? chain[locked] : stripped < n ? chain[stripped] : null
  return (
    <div className="sp-deal">
      <ol className="sp-deal__steps">
        {steps.map(([done, text], i) => (
          <li key={i} className={done ? 'is-done' : i === now ? 'is-now' : ''}>
            <span className="sp-deal__mark" aria-hidden="true">{done ? '✓' : i + 1}</span>
            {text}
          </li>
        ))}
      </ol>
      <p className="sp-deal__note">
        {slow && waitingOn != null ? `Waiting for ${name(waitingOn)}’s phone…` : two ? 'Neither phone can see the other’s hand.' : 'No phone can see anyone else’s hand.'}
      </p>
    </div>
  )
}

function roundLine(live: Live, name: (s: number) => string) {
  const r = live.cur
  if (r.winner === undefined) return ''
  if (r.forfeitBy !== undefined) return `${name(r.winner)} takes the round · +1`
  const p = (live.past ?? []).at(-1)
  return `${name(r.winner)} takes it · +${r.points}${p && p.cards?.length && r.points! > 1 ? ` · ${finishLabel(p)}` : ''}`
}

const pastCards = (p: Past) => (p.forfeit ? '—' : (p.cards ?? []).map(cardLabel).join(' '))

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, players, exit }: { room: Room; me: Me; st: SparState; players: (Seated | null)[]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const s = live.scores
  const seats = seatsOf(live)
  // by who sat down, not seats: a room opened for four can start with two
  const many = players.filter(Boolean).length > 2
  const winner = leaderOf(s, seats)
  const iWon = session.local ? winner !== -1 : winner === me.seatN
  const past = live.past ?? []
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
    session.start({ ...initialSparState(st.target, st.match + 1, inRoom.map((p) => p.seat)) })
  }, [session, me.isHost, imReady, othersReady, st.target, st.match, inRoom])

  const rivalry = useRivalryMulti(GAME, room, me, players, s, seats, st.match)
  // standings: those still in by points, then anyone who left
  const standing = [...seats].sort((a, b) => s[b] - s[a])
  const gone = players.flatMap((p, k) => (p && !seats.includes(k) ? [k] : []))
  const scoreLine = many ? standing.map((k) => s[k]).join(' — ') : `${s[0]} — ${s[1]}`
  const cardPlayers = players.flatMap((p, k) => (p ? [{ name: p.name, seat: k as SeatN, score: String(s[k] ?? 0), meta: seats.includes(k) ? 'points' : 'left' }] : []))
  const card: CardInput = {
    game: 'Spar',
    winner: cardPlayers.findIndex((p) => p.seat === winner),
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: cardPlayers,
    detail: { kind: 'rounds', rows: past.slice(-8).map((p) => ({ word: pastCards(p), seat: p.winner as SeatN, note: `+${p.points} ${finishLabel(p)}` })) },
  }
  const message = many ? multiMessage(standing.map(name), winner === -1 ? null : name(winner), scoreLine) : shareMessage('Spar', GAME, [name(0), name(1)], winner, scoreLine)

  return (
    <main className="spm spm-results screen-in">
      {iWon && <Confetti />}
      <div className="spm-results__head">
        <ResultMark winner={(winner < 2 ? winner : -1) as 0 | 1 | -1} />
        <p className="label">
          Match {st.match} · Spar · first to {st.target}
          {many ? ` · ${players.filter(Boolean).length} players` : ''}
        </p>
        <h1 className={`spm-results__title${iWon ? ' spm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${name(winner)} wins`}
        </h1>
      </div>
      {many ? (
        <ol className="sp-standings">
          {[...standing, ...gone].map((k, i) => (
            <li key={k} className={`sp-standings__row sp-standings__row--${k}${k === winner ? ' sp-standings__row--win' : ''}`}>
              <span className="sp-standings__place">{seats.includes(k) ? i + 1 : '–'}</span>
              <span className="sp-standings__who">
                {name(k)}
                {!session.local && k === me.seatN && <em> · you</em>}
                {!seats.includes(k) && <em> · left</em>}
              </span>
              <strong>{s[k] ?? 0}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-hud spm-results__cards">
          <ScoreCard p={players[0]} you={!session.local && me.seatN === 0} value={s[0]} meta="points" />
          <span className="mt-ended__vs" aria-hidden="true">vs</span>
          <ScoreCard p={players[1]} you={!session.local && me.seatN === 1} value={s[1]} meta="points" />
        </div>
      )}
      <ol className="sp-rounds">
        {past.map((p, i) => (
          <li key={i} className={`sp-rounds__row sp-rounds__row--${p.winner}`}>
            <span className="sp-rounds__n">{i + 1}</span>
            <span className="sp-rounds__who">{name(p.winner)}</span>
            <strong>{pastCards(p)}</strong>
            <span className="sp-rounds__note">
              +{p.points} {finishLabel(p)}
            </span>
          </li>
        ))}
      </ol>
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
function multiMessage(names: string[], winner: string | null, scoreLine: string) {
  const url = `${location.origin}/${GAME}`
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0])
  if (!winner) return `${list(names)} played Spar to a tie at the top (${scoreLine}) on Lash vs Seven. Settle it: ${url}`
  return `${winner} won Spar against ${list(names.filter((x) => x !== winner))} (${scoreLine}) on Lash vs Seven. Think you can do better? ${url}`
}

/** "Kofi", "Kofi & Esi", "Kofi, Esi & Yaw" */
const andList = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`)
