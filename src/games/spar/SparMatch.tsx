import { useEffect, useMemo, useRef, useState } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ResultActions } from '../../match/ResultActions'
import { VsBlock } from '../../components/VsBlock'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalry } from '../../match/useRivalry'
import type { CardInput } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { Backs, Card, Hand, TrickPips } from './Cards'
import { lockDeck, newKey, readHand, relockDeck, unlockFor, verifyDeal } from './deal'
import {
  TRICKS,
  SUIT_NAMES,
  byCard,
  cardLabel,
  checkPlays,
  dealLocal,
  dealerOf,
  finishLabel,
  forfeit,
  freshLive,
  matchOver,
  nextRound,
  other,
  play,
  playable,
  playsOf,
  postDeckA,
  postDeckB,
  postUnlock,
  remaining,
  revealKey,
  shuffledHands,
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

export function initialSparState(target = 10, match = 1): SparState {
  // who leads the first round alternates between matches
  return { target, match, live: freshLive(target, (match % 2 === 1 ? 0 : 1) as Seat) }
}

const sk = (s: Seat) => (s === 0 ? 's0' : 's1') as 's0' | 's1'

/* ── This round's key: only ever on this device ─────────────────────── */
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

export function SparMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as SparState
  const live = st.live
  const r = live.cur
  const plays = playsOf(r)
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const local = session.local
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !local && s === me.seat
  // whose cards are on screen: online that's you; on one device it's whoever holds the phone
  const view = me.seat
  const dealer = dealerOf(r)

  const over = matchOver(live)
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  /* ── the key and the hand ── */
  const roundId = `${room.code}:${room.createdAt}:${st.match}:${live.round}`
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
  const myKey = local ? null : getKey(false)
  // my lock is already on the deck, but the key that takes it off isn't on this device
  const lost = !local && live.phase !== 'done' && !myKey && (me.seat === dealer ? !!r.deckA : !!r.deckB)

  const unlockMine = r.unlock?.[sk(view)]
  const unlockSig = unlockMine?.join(',')
  const dealt = useMemo<number[] | null>(() => {
    if (local) return r.hands?.[view] ?? null
    return unlockMine && myKey ? readHand(unlockMine, myKey) : null
    // the unlocked cards only change once a round; key them by value, not by snapshot object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, r.hands, view, unlockSig, myKey])
  const hand = dealt ? remaining(dealt, plays, view).sort(byCard) : []
  const legal = playable(hand, plays)

  /* ── the deal: each phone does its part as soon as it's its turn ── */
  const step = local
    ? null
    : live.phase === 'deal'
      ? !r.deckA
        ? me.seat === dealer && 'lock'
        : !r.deckB
          ? me.seat !== dealer && 'relock'
          : !r.unlock?.[sk(other(me.seat))] && 'unlock'
      : live.phase === 'done' && r.forfeitBy === undefined && !r.keys?.[sk(me.seat)] && 'reveal'
  useEffect(() => {
    if (!step) return
    // a beat first, so the screen paints before the number crunching
    const t = setTimeout(() => {
      const seat = me.seat
      if (step === 'lock') {
        const deck = lockDeck(getKey(true)!)
        session.move<Live>((cur) => postDeckA(cur, seat, deck)).catch(() => {})
      } else if (step === 'relock' && r.deckA) {
        const deck = relockDeck(r.deckA, getKey(true)!)
        session.move<Live>((cur) => postDeckB(cur, seat, deck)).catch(() => {})
      } else if (step === 'unlock' && r.deckB) {
        const k = getKey(false)
        if (!k) return
        const cards = unlockFor(r.deckB, other(seat), k)
        session.move<Live>((cur) => postUnlock(cur, seat, cards)).catch(() => {})
      } else if (step === 'reveal') {
        const k = getKey(false)
        if (k) session.move<Live>((cur) => revealKey(cur, seat, k)).catch(() => {})
      }
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, roundId])

  // one device: deal in the open
  useEffect(() => {
    if (!local || live.phase !== 'deal') return
    const hands = shuffledHands()
    session.move<Live>((cur) => dealLocal(cur, hands))
  }, [local, live.phase, live.round, session])

  // waiting on the other phone during the deal: say so if it's slow
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (local || live.phase !== 'deal') return
    const t = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(t)
  }, [local, live.phase, r.deckA, r.deckB, r.unlock])

  /* ── the end-of-round check, once both keys are out ── */
  const [check, setCheck] = useState<{ ok: true } | { ok: false; msg: string } | null>(null)
  const bothKeys = !!(r.keys?.s0 && r.keys?.s1)
  useEffect(() => {
    setCheck(null)
    if (local || live.phase !== 'done' || !bothKeys || r.forfeitBy !== undefined) return
    let alive = true
    const t = setTimeout(() => {
      const v = verifyDeal({
        dealer,
        deckA: r.deckA ?? [],
        deckB: r.deckB ?? [],
        unlock: [r.unlock?.s0 ?? [], r.unlock?.s1 ?? []],
        keys: [r.keys!.s0!, r.keys!.s1!],
      })
      const bad = 'error' in v ? null : checkPlays(plays, v.hands)
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
  }, [local, live.phase, bothKeys, roundId])

  /* ── playing a card: tap to lift, tap again to play ── */
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [plays.length, live.round])
  const myTurn = live.phase === 'play' && live.turn === view && !!dealt
  const pick = (k: number) => {
    if (picked !== k) {
      setPicked(k)
      sound('tap')
      return
    }
    setPicked(null)
    sound('tap')
    const h = dealt ?? undefined
    session.move<Live>((cur) => play(cur, view, k, h)).catch(() => {})
  }

  // sounds: tricks won and lost, and the end of a round
  const seenRef = useRef({ n: plays.length, phase: live.phase })
  useEffect(() => {
    const seen = seenRef.current
    if (plays.length > seen.n && plays.length % 2 === 0) {
      const w = trickWinner(plays.slice(-2))
      if (live.phase !== 'done') sound(local || w === me.seat ? 'find' : 'tick')
    }
    if (live.phase === 'done' && seen.phase !== 'done') {
      sound(local || r.winner === me.seat ? 'findBig' : 'end')
    }
    seenRef.current = { n: plays.length, phase: live.phase }
  }, [plays, live.phase, r.winner, me.seat, local, sound])

  // pass & play: cover your hand whenever the phone changes hands
  const [holder, setHolder] = useState<string | null>(null)
  const holdKey = `${live.round}:${live.turn}`
  const cover = local && inMatch && live.phase === 'play' && holder !== holdKey

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} value={live.scores[0]} meta="points" />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} value={live.scores[1]} meta="points" />
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const hud = (
    <div className="mt-hud">
      <ScoreCard p={seats[0]} you={mine(0)} active={local && inMatch && live.phase === 'play' && live.turn === 0} value={live.scores[0]} meta={`of ${live.target}`} />
      <div className="sp-round">
        <span className="label">Round</span>
        <strong>{live.round + 1}</strong>
        <span className="sp-round__to">first to {live.target}</span>
      </div>
      <ScoreCard p={seats[1]} you={mine(1)} active={local && inMatch && live.phase === 'play' && live.turn === 1} value={live.scores[1]} meta={`of ${live.target}`} />
    </div>
  )

  /* ── what's on the table ── */
  const trickNo = Math.floor(plays.length / 2)
  const shown: Play[] = plays.length % 2 === 1 ? plays.slice(-1) : plays.slice(-2)
  const shownWinner = shown.length === 2 ? trickWinner(shown) : null
  const winners = Array.from({ length: trickNo }, (_, t) => trickWinner(trickAt(plays, t)))
  const leading = plays.length % 2 === 0
  const ledSuit = leading ? null : suitOf(plays[plays.length - 1].c)
  const last = trickNo === TRICKS - 1

  const status = (() => {
    if (live.phase === 'deal') return local ? 'Dealing…' : 'Shuffling…'
    if (live.phase === 'done') return roundLine(live, name)
    const who = live.turn
    if (local) return `${name(who)} ${leading ? 'leads' : 'to play'}${last ? ' · last trick' : ''}`
    if (who !== me.seat) return `${name(who)} ${leading ? 'leads' : 'to play'}${last ? ' · last trick' : ''}`
    if (leading) return last ? 'Your lead · last trick' : 'Your lead'
    const canFollow = hand.some((c) => suitOf(c) === ledSuit)
    return canFollow ? `Follow ${SUIT_NAMES[ledSuit!]}` : `No ${SUIT_NAMES[ledSuit!]} — play any card`
  })()

  const youAct = live.phase === 'play' && (local ? !cover : live.turn === me.seat)

  return (
    <main className="spm screen-in">
      {hud}
      <p className={`sp-status${youAct ? ' sp-status--you' : ''}${live.phase === 'done' ? ' sp-status--result' : ''}`} role="status">
        {status}
      </p>

      <section className="sp-table" aria-label="Table">
        <div className="sp-table__top">
          {live.phase === 'deal' ? (
            <span className="label sp-table__note">Round {live.round + 1}</span>
          ) : (
            <Backs n={TRICKS - plays.filter((p) => p.s === other(view)).length} seat={other(view)} name={name(other(view))} />
          )}
          <TrickPips winners={winners} current={live.phase === 'play' ? trickNo : -1} />
        </div>

        {live.phase === 'deal' && !local ? (
          <DealSteps live={live} name={name} slow={slow} />
        ) : (
          <div className="sp-trick">
            {[0, 1].map((i) => {
              const p = shown[i]
              const lead = i === 0
              const who = p ? p.s : lead ? live.turn : other(shown[0]?.s ?? live.turn)
              const won = p && shownWinner === p.s
              return (
                <div key={i} className={`sp-slot sp-slot--${who}${won ? ' sp-slot--won' : ''}`}>
                  <span className="sp-slot__who">
                    {name(who)}
                    <em>{lead ? ' · lead' : ''}</em>
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
            {!local && r.forfeitBy === undefined && (
              <p className={`sp-check${check && !check.ok ? ' sp-check--bad' : ''}`}>
                {check === null ? 'Checking the deal…' : check.ok ? '✓ Fair deal — both shuffles and every card checked' : check.msg}
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
            <button type="button" className="btn" onClick={() => session.move<Live>((cur) => forfeit(cur, me.seat)).catch(() => {})}>
              Give {name(other(me.seat))} the round
            </button>
          </div>
        ) : cover ? (
          <div className="sp-pass">
            <p className="label">Pass the phone</p>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => setHolder(holdKey)}>
              I’m {name(live.turn)} <span className="keycap">↵</span>
            </button>
          </div>
        ) : live.phase === 'deal' ? (
          <div className="sp-hand sp-hand--waiting" aria-hidden="true" />
        ) : (
          <>
            <Hand cards={hand} legal={legal} enabled={myTurn} selected={picked} onPick={pick} />
            <p className="sp-hint">{myTurn ? (picked !== null ? `Tap ${cardLabel(picked)} again to play it` : 'Tap a card to lift it') : ' '}</p>
          </>
        )}
      </div>

      {awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>}
    </main>
  )
}

function DealSteps({ live, name, slow }: { live: Live; name: (s: Seat) => string; slow: boolean }) {
  const r = live.cur
  const d = dealerOf(r)
  const o = other(d)
  const steps: [boolean, string][] = [
    [!!r.deckA, `${name(d)}’s phone locks and shuffles the deck`],
    [!!r.deckB, `${name(o)}’s phone locks it again and reshuffles`],
    [!!(r.unlock?.s0 && r.unlock?.s1), 'Each phone unlocks the other’s five cards'],
  ]
  const now = steps.findIndex(([done]) => !done)
  const waitingOn = now === 0 ? d : now === 1 ? o : null
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
      <p className="sp-deal__note">{slow && waitingOn !== null ? `Waiting for ${name(waitingOn)}’s phone…` : 'Neither phone can see the other’s hand.'}</p>
    </div>
  )
}

function roundLine(live: Live, name: (s: Seat) => string) {
  const r = live.cur
  if (r.winner === undefined) return ''
  if (r.forfeitBy !== undefined) return `${name(r.winner)} takes the round · +1`
  const p = (live.past ?? [])[live.round]
  return `${name(r.winner)} takes it · +${r.points}${p && p.cards?.length && r.points! > 1 ? ` · ${finishLabel(p)}` : ''}`
}

const pastCards = (p: Past) => (p.forfeit ? '—' : (p.cards ?? []).map(cardLabel).join(' '))

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: SparState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const s = live.scores
  const winner = (s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1) as Seat | -1
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const past = live.past ?? []

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      sound('findBig')
    }
  }, [iWon, sound])

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])
  const oppGone = room.status === 'abandoned' || !opp?.online

  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialSparState(st.target, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.target, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Spar',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: 'points' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: past.slice(-8).map((p) => ({ word: pastCards(p), seat: p.winner, note: `+${p.points} ${finishLabel(p)}` })) },
  }

  return (
    <main className="spm spm-results screen-in">
      {iWon && <Confetti />}
      <div className="spm-results__head">
        {winner !== -1 && <VsBlock mood="win" side={winner} eyes size={64} />}
        <p className="label">Match {st.match} · Spar · first to {st.target}</p>
        <h1 className={`spm-results__title${iWon ? ' spm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`}
        </h1>
      </div>
      <div className="mt-hud spm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta="points" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta="points" />
      </div>
      <ol className="sp-rounds">
        {past.map((p, i) => (
          <li key={i} className={`sp-rounds__row sp-rounds__row--${p.winner}`}>
            <span className="sp-rounds__n">{i + 1}</span>
            <span className="sp-rounds__who">{names[p.winner]}</span>
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
        message={shareMessage('Spar', GAME, names, winner, scoreLine)}
        oppName={opp?.name}
        imReady={imReady}
        oppReady={oppReady}
        oppGone={oppGone}
        onReady={() => (sound('tap'), session.ready(me.id))}
        onLeave={exit.now}
      />
    </main>
  )
}
