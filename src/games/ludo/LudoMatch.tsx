import { useEffect, useRef, useState } from 'react'
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
import { COLOR_HEX, COLOR_NAME, DieFace, LudoBoard, spot, type Dest, type TokenView } from './Board'
import {
  COLORS,
  HOME,
  YARD,
  backKick,
  colorsOf,
  exitBlocked,
  freshLive,
  homeCount,
  move,
  movable,
  roll,
  tokenTotal,
  type Color,
  type Live,
} from './engine'
import '../../styles/ludo.css'

const GAME = 'ludo'
/** The winning move stays up this long before the results. */
const RESULT_MS = 2200
/** the die shakes this long before it shows the number */
const SHAKE_MS = 480
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

export function initialLudoState(mode: 'quick' | 'full' = 'quick', color: Color = 'yellow', match = 1): LudoState {
  // whoever rolls first alternates between matches
  return { mode, color, match, live: freshLive(mode, color, (match % 2 === 1 ? 0 : 1) as Seat) }
}

const colorList = (cs: Color[]) => cs.map((c) => COLOR_NAME[c]).join(' + ')

export function LudoMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as LudoState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const local = session.local
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !local && s === me.seat

  const over = live.winner !== undefined
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  /* ── the die: everyone sees it shake, then land ── */
  const dieN = live.die?.n ?? 0
  const [shaking, setShaking] = useState(false)
  const [face, setFace] = useState(live.die?.v ?? 6)
  const seenDie = useRef(dieN)
  useEffect(() => {
    if (dieN === seenDie.current) return
    seenDie.current = dieN
    setShaking(true)
    sound('tick')
    const spin = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 60)
    const t = setTimeout(() => {
      clearInterval(spin)
      setFace(live.die?.v ?? 6)
      setShaking(false)
      if (live.die?.none) sound('error')
    }, SHAKE_MS)
    return () => {
      clearInterval(spin)
      clearTimeout(t)
    }
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
  const tokens: TokenView[] = live.colors.flat().flatMap((c) => (live.tokens[c] ?? []).map((pos, i) => ({ c, i, pos })))
  if (step !== null && live.last) {
    const L = live.last
    for (const t of tokens) {
      if (t.c === L.c && t.i === L.i) t.pos = L.path[step]
      const kick = L.kicks?.find((k) => k.c === t.c && k.i === t.i)
      if (kick) t.pos = kick.from
    }
  }

  /* ── my turn ── */
  const myTurn = !over && (local || live.turn === me.seat)
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

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} value={`${homeCount(live, 0)}/${tokenTotal(live, 0)}`} meta="home" />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} value={`${homeCount(live, 1)}/${tokenTotal(live, 1)}`} meta="home" />
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  /* ── what to say ── */
  const who = live.turn
  const v = live.die?.v ?? 0
  const status = (() => {
    if (over) return `${name(live.winner!)} brings them all home!`
    if (shaking) return live.die ? `${local || live.die.s !== me.seat ? name(live.die.s) : 'You'} rolled…` : 'Rolling…'
    if (step !== null) return live.last?.kicks?.length ? 'Kicked!' : ' '
    if (live.die?.none && !live.rolled && live.die.s !== who) {
      return `${local || live.die.s !== me.seat ? name(live.die.s) : 'You'} rolled ${live.die.v} — no move`
    }
    const bonus = live.last && live.die && live.die.v === 6 && !live.rolled && live.die.s === who && !live.die.none
    if (!live.rolled) {
      if (local) return `${name(who)}${bonus ? ' — six, roll again' : '’s roll'}`
      return who === me.seat ? (bonus ? 'Six! Roll again' : 'Your roll') : `${name(who)} ${bonus ? 'rolls again' : 'is rolling…'}`
    }
    if (!local && who !== me.seat) return `${name(who)} rolled ${v} · moving…`
    if (selected) return 'Forward, or back to capture?'
    const blocked = v === 6 && exitBlocked(live, who)
    return `${v === 6 ? 'Six! ' : ''}Pick a token${blocked ? ' · exit blocked' : ''}`
  })()

  const yardPulse =
    myTurn && live.rolled && v === 6 && !animating
      ? colorsOf(live, who).filter((c) => pickable.some((p) => p.c === c && live.tokens[c]?.[p.i] === 0))
      : []

  const view: Seat = local ? 0 : me.seat
  const youAct = inMatch && myTurn && !animating

  return (
    <main className="ldm screen-in">
      <div className="mt-hud">
        <ScoreCard
          p={seats[0]}
          you={mine(0)}
          active={local && inMatch && who === 0}
          value={`${homeCount(live, 0)}/${tokenTotal(live, 0)}`}
          meta={<Swatches colors={colorsOf(live, 0)} />}
        />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard
          p={seats[1]}
          you={mine(1)}
          active={local && inMatch && who === 1}
          value={`${homeCount(live, 1)}/${tokenTotal(live, 1)}`}
          meta={<Swatches colors={colorsOf(live, 1)} />}
        />
      </div>

      <div className="ld-stage">
        <LudoBoard
          colors={live.colors.flat()}
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
          style={{ borderColor: COLOR_HEX[colorsOf(live, who)[0]] }}
          onClick={doRoll}
          disabled={!canRoll}
          aria-label={canRoll ? 'Roll the die' : `Die showing ${face}`}
        >
          <DieFace v={live.die || shaking ? face : 6} />
        </button>
      </div>

      {awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>}
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

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: LudoState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const winner = (live.winner ?? -1) as Seat | -1
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]

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
    session.start({ ...initialLudoState(st.mode, st.color, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.mode, st.color, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const home: [number, number] = [homeCount(live, 0), homeCount(live, 1)]
  const total = tokenTotal(live, 0)
  const scoreLine = `${home[0]} — ${home[1]}`
  const card: CardInput = {
    game: 'Ludo',
    winner,
    scoreLine,
    headline: winner === -1 ? undefined : 'ALL TOKENS HOME',
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: `${home[k]}/${total}`, meta: 'home' })) as CardInput['players'],
    detail: {
      kind: 'ludo',
      yards: COLORS.map((c) => ({ x: YARD[c][0], y: YARD[c][1], hex: live.colors.flat().includes(c) ? COLOR_HEX[c] : null })),
      tokens: live.colors.flat().flatMap((c) => (live.tokens[c] ?? []).map((pos, i) => {
        const [x, y] = spot({ c, i, pos })
        return { x, y, hex: COLOR_HEX[c], home: pos === HOME }
      })),
      stats: [
        ['COLOURS', st.mode === 'full' ? '2 EACH' : '1 EACH'],
        ['CAPTURES', `${live.caps[0]} — ${live.caps[1]}`],
      ],
    },
  }

  return (
    <main className="ldm ldm-results screen-in">
      {iWon && <Confetti />}
      <div className="ldm-results__head">
        {winner !== -1 && <VsBlock mood="win" side={winner} eyes size={64} />}
        <p className="label">Match {st.match} · Ludo · {st.mode === 'full' ? '2 colours each' : '1 colour each'}</p>
        <h1 className={`ldm-results__title${iWon ? ' ldm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`}
        </h1>
        <p className="ldm-results__line">All {total} tokens home</p>
      </div>
      <div className="mt-hud ldm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={`${home[0]}/${total}`} meta={`${live.caps[0]} capture${live.caps[0] === 1 ? '' : 's'}`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={`${home[1]}/${total}`} meta={`${live.caps[1]} capture${live.caps[1] === 1 ? '' : 's'}`} />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Ludo', GAME, names, winner, scoreLine)}
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
