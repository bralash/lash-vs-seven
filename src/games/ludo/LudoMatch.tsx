import { useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { ludoMoments } from '../../match/moments'
import type { CardInput, SeatN } from '../../match/shareCard'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import { useSession } from '../../match/session'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useAwayPlayers } from '../../match/useOpponentAway'
import { COLOR_HEX, COLOR_NAME, Die3D, LudoBoard, spot, type Dest, type TokenView } from './Board'
import {
  COLORS,
  HOME,
  YARD,
  allColors,
  backKick,
  colorsOf,
  drop,
  exitBlocked,
  freshLive,
  homeCount,
  move,
  movable,
  orderOf,
  progress,
  roll,
  tokenTotal,
  type Color,
  type Live,
  type Seat,
} from './engine'
import '../../styles/spar.css'
import '../../styles/ludo.css'

const GAME = 'ludo'
/** The winning move stays up this long before the results. */
const RESULT_MS = 2200
/** the die tumbles this long before it shows the number */
const SHAKE_MS = 650
/** a token takes this long per square */
const STEP_MS = 110
/** when there's only one move, it's made on its own after this long */
const AUTO_MS = 550

export interface LudoState {
  mode: 'quick' | 'full'
  color: Color
  match: number
  live: Live
  ready?: Record<string, boolean>
}

/** `seats`: the seats taken (2–4 players). Whoever rolls first moves on one place each match. */
export function initialLudoState(mode: 'quick' | 'full' = 'quick', color: Color = 'yellow', match = 1, seats: Seat[] = [0, 1]): LudoState {
  return { mode, color, match, live: freshLive(mode, color, match - 1, seats.length ? seats : [0, 1]) }
}

const colorList = (cs: Color[]) => cs.map((c) => COLOR_NAME[c]).join(' + ')

export function LudoMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as LudoState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const local = session.local
  const seats = seatedPlayers(room)
  const many = seats.filter(Boolean).length > 2
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !local && s === me.seatN

  const over = live.winner !== undefined
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const others = local || session.bot ? [] : stillIn(room).filter((p) => p.id !== me.id)
  const away = useAwayPlayers(GAME, room.code, others, inMatch)
  const carryOn = others.length >= 2

  // someone left the room (or dropped) in a 3–4 player game: their tokens come off and play goes on.
  // Any phone can do it; the transaction only lands once.
  const outKey = Object.keys(room.out ?? {}).join(',')
  useEffect(() => {
    for (const s of orderOf(live)) {
      const p = seats[s]
      if (p && room.out?.[p.id]) session.move<Live>((cur) => drop(cur, s)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outKey])

  /* ── the die: everyone sees it shake, then land ── */
  const dieN = live.die?.n ?? 0
  const [shaking, setShaking] = useState(false)
  const face = live.die?.v ?? 6
  const seenDie = useRef(dieN)
  useEffect(() => {
    if (dieN === seenDie.current) return
    seenDie.current = dieN
    setShaking(true)
    sound('tick')
    const t = setTimeout(() => {
      setShaking(false)
      if (live.die?.none) sound('error')
    }, SHAKE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dieN])

  /* ── moves animate square by square on both screens ── */
  const lastN = live.last?.n ?? 0
  const seenMove = useRef(lastN)
  const [step, setStep] = useState<number | null>(null)
  useEffect(() => {
    if (lastN === seenMove.current || !live.last) return
    seenMove.current = lastN
    const path = live.last.path
    let k = 0
    setStep(0)
    const t = setInterval(() => {
      k++
      if (k >= path.length) {
        clearInterval(t)
        setStep(null)
        if (live.last?.kicks?.length) sound('error')
        else if (live.tokens[live.last!.c]?.[live.last!.i] === HOME) sound('find')
        return
      }
      setStep(k)
      sound('tap')
    }, STEP_MS)
    sound('tap')
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastN])
  const animating = step !== null || shaking

  // what's on the board right now (mid-move: the mover on its path, its victims still standing)
  const tokens: TokenView[] = allColors(live).flatMap((c) => (live.tokens[c] ?? []).map((pos, i) => ({ c, i, pos })))
  if (step !== null && live.last) {
    const L = live.last
    for (const t of tokens) {
      if (t.c === L.c && t.i === L.i) t.pos = L.path[step]
      const kick = L.kicks?.find((k) => k.c === t.c && k.i === t.i)
      if (kick) t.pos = kick.from
    }
  }

  /* ── my turn ── */
  const myTurn = !over && (local || live.turn === me.seatN)
  const canRoll = inMatch && myTurn && !live.rolled && !animating
  const pickable = inMatch && myTurn && !animating ? movable(live) : []
  const [selected, setSelected] = useState<{ c: Color; i: number } | null>(null)
  useEffect(() => setSelected(null), [dieN, lastN])

  const doRoll = () => {
    if (!canRoll) return
    const v = 1 + (crypto.getRandomValues(new Uint8Array(1))[0] % 6)
    const seat = live.turn
    session.move<Live>((cur) => roll(cur, seat, v)).catch(() => {})
  }
  const go = (c: Color, i: number, dir: 'forward' | 'back') => {
    setSelected(null)
    const seat = live.turn
    session.move<Live>((cur) => move(cur, seat, c, i, dir)).catch(() => {})
  }
  const onToken = (c: Color, i: number) => {
    const v = live.die?.v ?? 0
    if (backKick(live, c, i, v) !== null) {
      sound('tap')
      setSelected((s) => (s && s.c === c && s.i === i ? null : { c, i }))
    } else go(c, i, 'forward')
  }
  const dests: Dest[] = []
  if (selected) {
    const v = live.die?.v ?? 0
    const pos = live.tokens[selected.c]?.[selected.i] ?? 0
    dests.push({ pos: pos === 0 ? 1 : pos + v, dir: 'forward' })
    const b = backKick(live, selected.c, selected.i, v)
    if (b !== null) dests.push({ pos: b, dir: 'back' })
  }

  // only one real choice (one token, or tokens of one colour sharing a square / all in the yard) and no
  // forward-or-back question: make it after a beat, so nobody has to hunt for a 15px token
  const choices = new Set(pickable.map((p) => `${p.c}:${live.tokens[p.c]?.[p.i]}`))
  const only = choices.size === 1 && backKick(live, pickable[0].c, pickable[0].i, live.die?.v ?? 0) === null ? pickable[0] : null
  const autoKey = only ? `${dieN}:${lastN}:${only.c}:${only.i}` : ''
  useEffect(() => {
    if (!only) return
    const t = setTimeout(() => go(only.c, only.i, 'forward'), AUTO_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey])

  // Enter / Space rolls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && canRoll && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        doRoll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const playing = orderOf(live)
  /** a seat's card: its colours and how many it has home ('left' once it's gone) */
  const card = (s: Seat) => {
    const gone = !playing.includes(s)
    return (
      <ScoreCard
        key={s}
        p={seats[s]}
        you={mine(s)}
        active={local && inMatch && live.turn === s}
        turn={inMatch && live.turn === s}
        value={gone ? '–' : `${homeCount(live, s)}/${tokenTotal(live, s)}`}
        meta={gone ? 'left' : <Swatches colors={colorsOf(live, s)} />}
      />
    )
  }
  const scoreboard = many ? (
    <div className="sp-hud-many">{seats.map((p, s) => p && card(s))}</div>
  ) : (
    <>
      {card(0)}
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      {card(1)}
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  /* ── what to say ── */
  const who = live.turn
  const v = live.die?.v ?? 0
  const status = (() => {
    if (over) return `${name(live.winner!)} brings them all home!`
    if (shaking) return live.die ? `${local || live.die.s !== me.seatN ? name(live.die.s) : 'You'} rolled…` : 'Rolling…'
    if (step !== null) return live.last?.kicks?.length ? 'Kicked!' : ' '
    if (live.die?.none && !live.rolled && live.die.s !== who) {
      return `${local || live.die.s !== me.seatN ? name(live.die.s) : 'You'} rolled ${live.die.v} — no move`
    }
    const bonus = live.last && live.die && live.die.v === 6 && !live.rolled && live.die.s === who && !live.die.none
    if (!live.rolled) {
      if (local) return `${name(who)}${bonus ? ' — six, roll again' : '’s roll'}`
      return who === me.seatN ? (bonus ? 'Six! Roll again' : 'Your roll') : `${name(who)} ${bonus ? 'rolls again' : 'is rolling…'}`
    }
    if (!local && who !== me.seatN) return `${name(who)} rolled ${v} · moving…`
    if (selected) return 'Forward, or back to capture?'
    const blocked = v === 6 && exitBlocked(live, who)
    return `${v === 6 ? 'Six! ' : ''}Pick a token${blocked ? ' · exit blocked' : ''}`
  })()

  const yardPulse =
    myTurn && live.rolled && v === 6 && !animating
      ? colorsOf(live, who).filter((c) => pickable.some((p) => p.c === c && live.tokens[c]?.[p.i] === 0))
      : []

  const view: Seat = local ? 0 : me.seatN
  const youAct = inMatch && myTurn && !animating

  return (
    <main className="ldm screen-in">
      {many ? scoreboard : <div className="mt-hud">{scoreboard}</div>}

      <div className="ld-stage">
        <LudoBoard
          colors={allColors(live)}
          bottom={colorsOf(live, view)[0]}
          tokens={tokens}
          pickable={pickable}
          selected={selected}
          dests={dests}
          pulse={yardPulse}
          onToken={onToken}
          onDest={(dir) => selected && go(selected.c, selected.i, dir)}
        />
      </div>

      {/* under the board, where the thumb already is: what's happening, and the die */}
      <div className="ld-controls">
        <p className={`ld-status${youAct ? ' ld-status--you' : ''}`} role="status">
          <span className="ld-status__dot" style={{ background: COLOR_HEX[colorsOf(live, who)[0]] }} aria-hidden="true" />
          {status}
        </p>
        <button
          type="button"
          className={`ld-die${shaking ? ' ld-die--shake' : ''}${canRoll ? ' ld-die--go' : ''}`}
          style={{ '--die-tint': COLOR_HEX[colorsOf(live, who)[0]] } as CSSProperties}
          onClick={doRoll}
          disabled={!canRoll}
          aria-label={canRoll ? 'Roll the die' : shaking ? 'Rolling' : `Die showing ${face}`}
        >
          <Die3D v={live.die ? face : 6} n={dieN} />
        </button>
      </div>

      {away.map((a) => (
        <p key={a.id} className="mt-banner" role="status">
          {a.name} disconnected · {carryOn ? 'taken off the board' : 'ending the match'} in {a.secs}s unless they’re back
        </p>
      ))}
    </main>
  )
}

function Swatches({ colors }: { colors: Color[] }) {
  return (
    <span className="ld-swatches" aria-label={colorList(colors)}>
      {colors.map((c) => (
        <i key={c} style={{ background: COLOR_HEX[c] }} />
      ))}
    </span>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: LudoState; seats: (Seated | null)[]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const winner: number = live.winner ?? -1
  const iWon = session.local ? winner !== -1 : winner === me.seatN
  const many = seats.filter(Boolean).length > 2
  const name = (k: number) => seats[k]?.name ?? `Player ${k + 1}`

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
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !othersReady) return
    dealt.current = true
    session.start({ ...initialLudoState(st.mode, st.color, st.match + 1, inRoom.map((p) => p.seat)) })
  }, [session, me.isHost, imReady, othersReady, st.mode, st.color, st.match, inRoom])

  // the standings: the winner, then whoever has most home, then whoever's furthest round
  const playing = orderOf(live)
  const standing = [...playing].sort((a, b) => (a === winner ? -1 : b === winner ? 1 : homeCount(live, b) - homeCount(live, a) || progress(live, b) - progress(live, a)))
  const gone = seats.flatMap((p, k) => (p && !playing.includes(k) ? [k] : []))
  const scores = seats.map((_, s) => (s === winner ? 1 : 0))
  const rivalry = useRivalryMulti(GAME, room, me, seats, scores, playing, st.match, ludoMoments(live))
  const home = (k: number) => homeCount(live, k)
  const total = tokenTotal(live, winner === -1 ? standing[0] : winner)
  const scoreLine = standing.map(home).join(' — ')
  const cardPlayers = seats.flatMap((p, k) =>
    p ? [{ name: p.name, seat: k as SeatN, score: playing.includes(k) ? `${home(k)}/${tokenTotal(live, k)}` : '–', meta: playing.includes(k) ? 'home' : 'left' }] : [],
  )
  const card: CardInput = {
    game: 'Ludo',
    winner: cardPlayers.findIndex((p) => p.seat === winner),
    scoreLine,
    headline: winner === -1 ? undefined : 'ALL TOKENS HOME',
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: cardPlayers,
    detail: {
      kind: 'ludo',
      yards: COLORS.map((c) => ({ x: YARD[c][0], y: YARD[c][1], hex: allColors(live).includes(c) ? COLOR_HEX[c] : null })),
      tokens: allColors(live).flatMap((c) =>
        (live.tokens[c] ?? []).map((pos, i) => {
          const [x, y] = spot({ c, i, pos })
          return { x, y, hex: COLOR_HEX[c], home: pos === HOME }
        }),
      ),
      stats: [
        ['COLOURS', st.mode === 'full' && !many ? '2 EACH' : '1 EACH'],
        ['CAPTURES', standing.map((k) => live.caps?.[k] ?? 0).join(' — ')],
      ],
    },
  }
  const message = many ? multiMessage(standing.map(name), winner === -1 ? null : name(winner)) : shareMessage('Ludo', GAME, [name(0), name(1)], winner as 0 | 1 | -1, scoreLine)
  const caps = (k: number) => live.caps?.[k] ?? 0

  return (
    <main className="ldm ldm-results screen-in">
      {iWon && <Confetti />}
      <div className="ldm-results__head">
        <ResultMark winner={(winner < 2 ? winner : -1) as 0 | 1 | -1} />
        <p className="label">
          Match {st.match} · Ludo · {many ? `${seats.filter(Boolean).length} players` : st.mode === 'full' ? '2 colours each' : '1 colour each'}
        </p>
        <h1 className={`ldm-results__title${iWon ? ' ldm-results__title--win' : ''}`}>{winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${name(winner)} wins`}</h1>
        <p className="ldm-results__line">All {total} tokens home</p>
      </div>
      {many ? (
        <ol className="sp-standings">
          {[...standing, ...gone].map((k, i) => (
            <li key={k} className={`sp-standings__row sp-standings__row--${k}${k === winner ? ' sp-standings__row--win' : ''}`}>
              <span className="sp-standings__place">{playing.includes(k) ? i + 1 : '–'}</span>
              <span className="sp-standings__who">
                <Swatches colors={colorsOf(live, k)} /> {name(k)}
                {!session.local && k === me.seatN && <em> · you</em>}
                {!playing.includes(k) && <em> · left</em>}
              </span>
              <strong>{playing.includes(k) ? `${home(k)}/${tokenTotal(live, k)} home · ${caps(k)} ✕` : ''}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-hud ldm-results__cards">
          <ScoreCard p={seats[0]} you={!session.local && me.seatN === 0} value={`${home(0)}/${tokenTotal(live, 0)}`} meta={`${caps(0)} capture${caps(0) === 1 ? '' : 's'}`} />
          <span className="mt-ended__vs" aria-hidden="true">vs</span>
          <ScoreCard p={seats[1]} you={!session.local && me.seatN === 1} value={`${home(1)}/${tokenTotal(live, 1)}`} meta={`${caps(1)} capture${caps(1) === 1 ? '' : 's'}`} />
        </div>
      )}
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

/** The share text for a 3–4 player game, names in finishing order. */
function multiMessage(names: string[], winner: string | null) {
  const url = `${location.origin}/${GAME}`
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0])
  if (!winner) return `${list(names)} played Ludo on Lash vs Seven. Your turn: ${url}`
  return `${winner} brought every token home first at Ludo against ${list(names.filter((x) => x !== winner))} on Lash vs Seven. Think you can do better? ${url}`
}
