import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { MatchEnded } from '../../match/MatchEnded'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession, useVsOps } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import type { CardInput } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { useRivalry } from '../../match/useRivalry'
import { newKey } from '../spar/deal'
import { FACES, FaceArt } from './Faces'
import {
  answerAsk,
  ask,
  canFlip,
  cardsFor,
  flipLocal,
  forfeit,
  freshLocal,
  freshOnline,
  pairOf,
  postDeckA,
  postDeckB,
  postKey,
  readPart,
  verifyBoard,
  type Live,
  type Size,
} from './engine'
import '../../styles/memory.css'

const GAME = 'memory'
/** The last pair stays up this long before the results. */
const RESULT_MS = 1800
/** After a miss, the two cards stay up at least this long before anyone can flip again. */
const LOOK_MS = 900

export interface MemoryState {
  size: Size
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialMemoryState(size: Size = 4, match = 1): MemoryState {
  // who flips first alternates between matches; one device turns the deal into a shuffled layout
  return { size, match, live: freshOnline(size, (match % 2 === 1 ? 0 : 1) as Seat) }
}

// each phone's lock for this board: sessionStorage survives a refresh, never leaves this tab
const keyName = (id: string) => `lvs_mem:${id}`
function myKey(id: string): string | null {
  try {
    return sessionStorage.getItem(keyName(id))
  } catch {
    return null
  }
}
function makeKey(id: string): string {
  const k = newKey()
  try {
    sessionStorage.setItem(keyName(id), k)
  } catch {
    /* storage blocked: the key lives for this page only */
  }
  return k
}

export function MemoryMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as MemoryState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !session.local && s === me.seat
  const vsOps = useVsOps()
  // one device (pass & play, Ops): the board is shuffled right here, in the open
  const open = session.local || vsOps

  const over = live.phase === 'done'
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  // one device: shuffle the board
  useEffect(() => {
    if (open && live.phase === 'deal') session.move<Live>((cur) => (cur.phase === 'deal' ? freshLocal(cur.size, cur.starter) : undefined)).catch(() => {})
  }, [open, live.phase, session])

  /* ── online: the deal, and taking locks off ── */
  const keyId = `${room.code}:${room.createdAt}:${st.match}`
  const [key, setKey] = useState(() => (open ? null : myKey(keyId)))
  useEffect(() => setKey(open ? null : myKey(keyId)), [keyId, open])
  // a key is made when this phone first locks the deck; after that, losing it means you can't play on
  const lostKey = !open && live.phase !== 'deal' && !key && (live.dealer === me.seat ? !!live.deckA : !!live.deckB)

  useEffect(() => {
    if (open || live.phase !== 'deal') return
    const dealer = live.dealer === me.seat
    if (dealer ? live.deckA : !live.deckA || live.deckB) return
    // reuse a key already saved for this board: an effect that runs twice must not lock with two keys
    const k = key ?? myKey(keyId) ?? makeKey(keyId)
    if (!key) setKey(k)
    session.move<Live>((cur) => (dealer ? postDeckA(cur, me.seat, k) : postDeckB(cur, me.seat, k))).catch(() => {})
  }, [open, live.phase, live.dealer, live.deckA, live.deckB, me.seat, key, keyId, session])

  const askFor = live.ask
  const part = live.part
  useEffect(() => {
    if (open || !key) return
    if (askFor && askFor.s !== me.seat) session.move<Live>((cur) => answerAsk(cur, key)).catch(() => {})
    else if (part && part.s === me.seat) session.move<Live>((cur) => readPart(cur, key)).catch(() => {})
  }, [open, key, askFor, part, me.seat, session])

  // the end: show my key so the other phone can check the whole board
  useEffect(() => {
    if (!open && over && key && !live.keys?.[`s${me.seat}`]) session.move<Live>((cur) => postKey(cur, me.seat, key)).catch(() => {})
  }, [open, over, key, live.keys, me.seat, session])

  /* ── what's face up ── */
  const shown = useMemo(() => {
    const m = new Map<number, number>()
    for (const f of live.log ?? []) m.set(f.i, f.c)
    return m
  }, [live.log])
  const upSlots = new Set((live.up ?? []).map((f) => f.i))
  const lifting = askFor?.i ?? part?.i

  // after a miss, give everyone a moment to look before the next flip
  const [looking, setLooking] = useState(false)
  const missKey = live.miss ? (live.up ?? []).map((f) => f.i).join(',') + ':' + (live.log ?? []).length : ''
  useEffect(() => {
    if (!missKey) return
    setLooking(true)
    const t = setTimeout(() => setLooking(false), LOOK_MS)
    return () => clearTimeout(t)
  }, [missKey])

  // sounds: each card turned over, a pair, a miss
  const flips = (live.log ?? []).length
  const pairs = live.scores[0] + live.scores[1]
  const seenRef = useRef({ flips, pairs })
  useEffect(() => {
    const seen = seenRef.current
    if (pairs > seen.pairs) sound('find')
    else if (flips > seen.flips) sound('tap')
    seenRef.current = { flips, pairs }
  }, [flips, pairs, sound])

  const flipper: Seat = session.local ? live.turn : me.seat
  const myTurn = live.phase === 'play' && (session.local || live.turn === me.seat)
  const tap = (i: number) => {
    if (!myTurn || looking || !canFlip(live.miss ? { ...live, miss: false, up: [] } : live, flipper, i)) return
    if (open) session.move<Live>((cur) => flipLocal(cur, flipper, i)).catch(() => {})
    else session.move<Live>((cur) => ask(cur, flipper, i)).catch(() => {})
  }

  const left = cardsFor(live.size) / 2 - pairs
  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} value={live.scores[0]} meta="pairs" />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} value={live.scores[1]} meta="pairs" />
    </>
  )
  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const status =
    live.phase === 'deal'
      ? 'Shuffling…'
      : over
        ? live.result?.winner === -1
          ? 'All found: a draw'
          : 'All pairs found'
        : session.local
          ? `${name(live.turn)}’s turn`
          : live.turn === me.seat
            ? askFor || part
              ? 'Turning it over…'
              : 'Your turn'
            : `${name(live.turn)}’s turn`

  return (
    <main className="memm screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={live.phase === 'play' && live.turn === 0} value={live.scores[0]} meta="pairs" />
        <div className="mem-mid">
          <span className="label">Left</span>
          <strong>{left}</strong>
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={live.phase === 'play' && live.turn === 1} value={live.scores[1]} meta="pairs" />
      </div>
      <p className={`mem-status${myTurn && !looking ? ' mem-status--you' : ''}`} role="status">
        {status}
      </p>

      {lostKey ? (
        <div className="mem-warn-box">
          <p className="mem-warn">This board’s key isn’t on this device any more (the page was opened somewhere else), so you can’t turn cards over.</p>
          <button type="button" className="btn" onClick={() => session.move<Live>((cur) => forfeit(cur, me.seat)).catch(() => {})}>
            Give {name((1 - me.seat) as Seat)} the game
          </button>
        </div>
      ) : (
        <div className={`mem-board mem-board--${live.size}${myTurn && !looking ? ' mem-board--live' : ''}`} style={{ '--n': live.size } as CSSProperties}>
          {Array.from({ length: cardsFor(live.size) }, (_, i) => {
            const owner = live.found[i]
            const up = owner !== '.' || upSlots.has(i)
            const c = up ? shown.get(i) : undefined
            const face = c !== undefined ? FACES[pairOf(c)] : undefined
            const missed = live.miss && upSlots.has(i)
            return (
              <button
                key={i}
                type="button"
                className={`mem-card${up ? ' mem-card--up' : ''}${owner !== '.' ? ` mem-card--found mem-card--${owner}` : ''}${missed ? ' mem-card--miss' : ''}${lifting === i ? ' mem-card--lifting' : ''}`}
                onClick={() => tap(i)}
                disabled={!myTurn || up}
                aria-label={face ? `${face.name}${owner !== '.' ? `, found by ${name(Number(owner) as Seat)}` : ''}` : `Card ${i + 1}, face down`}
              >
                <span className="mem-card__inner">
                  <span className="mem-card__back" aria-hidden="true">◆</span>
                  <span className="mem-card__face" style={face ? ({ '--bg': face.bg } as CSSProperties) : undefined}>
                    {face && <FaceArt face={face} />}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>}
    </main>
  )
}

/** The finished board, small: every pair face up in its finder's colour. */
function Recap({ live }: { live: Live }) {
  const shown = new Map<number, number>()
  for (const f of live.log ?? []) shown.set(f.i, f.c)
  return (
    <div className={`mem-board mem-board--recap mem-board--${live.size}`} style={{ '--n': live.size } as CSSProperties} aria-label="The finished board">
      {Array.from({ length: cardsFor(live.size) }, (_, i) => {
        const c = shown.get(i)
        const owner = live.found[i]
        const face = c !== undefined && owner !== '.' ? FACES[pairOf(c)] : undefined
        return (
          <span key={i} className={`mem-card mem-card--up${owner !== '.' ? ` mem-card--found mem-card--${owner}` : ''}`}>
            <span className="mem-card__inner">
              <span className="mem-card__back" aria-hidden="true">◆</span>
              <span className="mem-card__face" style={face ? ({ '--bg': face.bg } as CSSProperties) : undefined}>
                {face && <FaceArt face={face} />}
              </span>
            </span>
          </span>
        )
      })}
    </div>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: MemoryState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const vsOps = useVsOps()
  const live = st.live
  const winner = (live.result?.winner ?? -1) as Seat | -1
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      sound('findBig')
    }
  }, [iWon, sound])

  // online: once both keys are out, check the deal and every card shown
  const check = useMemo(() => (session.local || vsOps ? null : verifyBoard(live)), [live, session.local, vsOps])

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])
  const oppGone = room.status === 'abandoned' || !opp?.online

  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialMemoryState(st.size, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.size, st.match])

  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${live.scores[0]} — ${live.scores[1]}`
  const flips = (live.log ?? []).length
  const card: CardInput = {
    game: 'Memory',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(live.scores[k]), meta: 'pairs' })) as CardInput['players'],
    detail: { kind: 'crossword', rows: live.size, cols: live.size, colours: live.found, stats: [['Board', `${live.size}×${live.size}`], ['Cards turned', String(flips)]] },
  }

  return (
    <main className="memm memm-results screen-in">
      {iWon && <Confetti />}
      <div className="memm-results__head">
        <ResultMark winner={winner} />
        <p className="label">Match {st.match} · Memory</p>
        <h1 className={`memm-results__title${iWon ? ' memm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`}
        </h1>
        <p className="hint">
          {live.result?.forfeit ? 'by forfeit' : `${live.scores[0]} – ${live.scores[1]} pairs · ${flips} cards turned`}
        </p>
      </div>
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={live.scores[0]} meta="pairs" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={live.scores[1]} meta="pairs" />
      </div>
      <Recap live={live} />
      {check && 'error' in check && <p className="mem-warn">Something doesn’t add up: {check.error} doesn’t match what was locked in.</p>}
      {check && 'layout' in check && <p className="hint mem-check">✓ The shuffle and every card shown check out</p>}
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Memory', GAME, names, winner, scoreLine)}
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
