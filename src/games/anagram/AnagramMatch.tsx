import { ref, runTransaction, set } from 'firebase/database'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/firebase'
import { useServerNow } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import type { MatchExit, Me } from '../../lobby/Lobby'
import type { OpsSense } from '../../match/bot'
import { roomPath, seatedPlayers, startMatch, stillIn, type Room } from '../../lobby/rooms'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ResultActions } from '../../match/ResultActions'
import { VsBlock } from '../../components/VsBlock'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalryMulti } from '../../match/useRivalry'
import type { CardInput, SeatN } from '../../match/shareCard'
import { Countdown } from '../../match/Countdown'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import type { Seated } from '../../match/types'
import { useAwayPlayers } from '../../match/useOpponentAway'
import {
  ROUNDS,
  ROUND_MS,
  isAnswer,
  phaseAt,
  pickTargets,
  roundKey,
  scramble,
  timeline,
  type RoundTimes,
  type Solve,
  type SolveMap,
} from './engine'
import { prefetchDefinition, useDefinition } from './useDefinition'
import '../../styles/anagram.css'

const GAME = 'anagram'
/** How long the "GO!" beat stays up once the first round starts. */
const GO_MS = 650

export interface AnagramState {
  targets: string[]
  scrambles: string[]
  match: number
  solved?: SolveMap
  /** letters placed so far this round, per player — drives the opponent's progress dots */
  progress?: Record<string, { r: number; n: number }>
  ready?: Record<string, boolean>
}

export function initialAnagramState(match = 1): AnagramState {
  const targets = pickTargets()
  return { targets, scrambles: targets.map(scramble), match }
}

const path = (code: string, rest: string) => `${roomPath(GAME, code)}/${rest}`

/**
 * What the Ultimates need to know: Anagram is a race, so nobody has a turn, and every round won
 * charges the winner's Ultimate. The latest solved round stays the "game that ended" until the
 * next one is solved; its tag tells the rounds apart.
 */
export const anagramSense: OpsSense = {
  turn: () => null,
  standing: () => null,
  ended: (state) => {
    const st = state as unknown as AnagramState
    for (let r = ROUNDS - 1; r >= 0; r--) {
      const solve = st.solved?.[roundKey(r)]
      if (solve) return { winner: 0, by: solve.by, tag: `${st.match}:${r}`, final: r === ROUNDS - 1 }
    }
    return null
  },
}

export function AnagramMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as AnagramState
  const now = useServerNow(100)
  const nowRef = useRef(now)
  nowRef.current = now
  const { play } = useSound()

  // `now` is only a fallback for the instant before startedAt arrives, so it isn't a dependency
  const rounds = useMemo(() => timeline(room.startedAt ?? nowRef.current, st.solved), [room.startedAt, st.solved])
  const { phase, r } = phaseAt(now, rounds)
  const round = rounds[r]
  const target = st.targets[r]

  const seats = seatedPlayers(room)
  const seated = seats.filter((p): p is Seated => !!p)
  const many = seated.length > 2
  const wins = (p: Seated | null) => (p ? rounds.filter((x) => x.solve?.by === p.id).length : 0)

  const abandoned = room.status === 'abandoned'
  const lastEnd = rounds[ROUNDS - 1].revealEnd
  const endedEarly = abandoned && (room.endedAt ?? 0) < lastEnd
  const inMatch = !abandoned && phase !== 'results'

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  // someone dropped: a short window to come back; with two that ends the match, with more the rest carry on
  const others = stillIn(room).filter((p) => p.id !== me.id)
  const away = useAwayPlayers(GAME, room.code, others, inMatch)

  /* ── answer building ───────────────────────────────────────────────── */
  // Tiles are positions in the scramble; `picked` lists them in the order they were tapped.
  const [order, setOrder] = useState<number[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [wrong, setWrong] = useState(0)
  const [claimLost, setClaimLost] = useState(false)
  const scrambled = st.scrambles[r] ?? ''

  // fresh round: reset tiles
  const roundId = `${st.match}:${r}`
  useEffect(() => {
    setOrder([...scrambled].map((_, i) => i))
    setPicked([])
    setClaimLost(false)
  }, [roundId]) // only when a new round (or rematch) begins

  // look the answer up while the round is still running, so the reveal can show it straight away
  useEffect(() => {
    if (phase === 'play') prefetchDefinition(target)
  }, [phase, target])

  const canPlay = phase === 'play' && !round.solve && !claimLost
  const attempt = picked.map((i) => scrambled[i]).join('')

  // mirror my progress so the opponent sees letters filling in
  useEffect(() => {
    if (phase !== 'play') return
    set(ref(db, path(room.code, `state/progress/${me.id}`)), { r, n: picked.length }).catch(() => {})
  }, [picked.length, r, phase, room.code, me.id])

  const place = useCallback(
    (i: number) => {
      if (!canPlay) return
      setPicked((p) => (p.includes(i) ? p : [...p, i]))
      play('tap')
    },
    [canPlay, play],
  )
  const unplace = (slot: number) => canPlay && setPicked((p) => p.filter((_, k) => k !== slot))
  const backspace = useCallback(() => canPlay && setPicked((p) => p.slice(0, -1)), [canPlay])
  const clear = useCallback(() => canPlay && setPicked([]), [canPlay])
  const reshuffle = useCallback(() => {
    if (!canPlay) return
    setOrder((o) => {
      const n = [...o]
      for (let i = n.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[n[i], n[j]] = [n[j], n[i]]
      }
      return n
    })
    play('tap')
  }, [canPlay, play])

  // every letter placed → check it
  useEffect(() => {
    if (!canPlay || !target || picked.length !== target.length) return
    if (!isAnswer(attempt, target)) {
      play('error')
      setWrong((w) => w + 1)
      const t = setTimeout(() => setPicked([]), 420)
      return () => clearTimeout(t)
    }
    // First correct answer takes the round. Transaction, so two near-simultaneous answers can't both win.
    const at = nowRef.current
    if (at > round.start + ROUND_MS) return
    runTransaction(ref(db, path(room.code, `state/solved/${roundKey(r)}`)), (cur: Solve | null) =>
      cur ? undefined : { by: me.id, word: attempt, at },
    )
      .then((res) => {
        if (!res.committed) setClaimLost(true)
      })
      .catch(() => setClaimLost(true))
  }, [picked.length]) // checked once, at the moment the last letter lands

  // physical keyboard on desktop: letters place tiles, Backspace removes, Space shuffles, Esc clears
  useEffect(() => {
    if (!canPlay) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Backspace') {
        e.preventDefault()
        backspace()
        return
      }
      if (e.key === 'Escape') {
        clear()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        reshuffle()
        return
      }
      const ch = e.key.toUpperCase()
      if (!/^[A-Z]$/.test(ch)) return
      const free = order.find((i) => scrambled[i] === ch && !picked.includes(i))
      if (free !== undefined) place(free)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canPlay, order, picked, scrambled, place, backspace, clear, reshuffle])

  /* ── sounds on phase changes ───────────────────────────────────────── */
  const secsLeft = Math.max(0, Math.ceil((round.start + ROUND_MS - now) / 1000))
  const countdown = Math.max(1, Math.ceil((rounds[0].start - now) / 1000))
  const beatRef = useRef('')
  useEffect(() => {
    const beat = phase === 'countdown' ? `c${countdown}` : phase === 'play' ? `p${r}:${secsLeft}` : `${phase}${r}`
    if (beat === beatRef.current) return
    const prev = beatRef.current
    beatRef.current = beat
    if (!prev) return // no sounds on first render (e.g. after a refresh)
    if (phase === 'countdown') play('tick')
    else if (phase === 'play' && !prev.startsWith(`p${r}:`)) play('start')
    else if (phase === 'play' && secsLeft <= 10) play('tick')
    else if (phase === 'reveal') play(round.solve?.by === me.id ? 'findBig' : 'end')
  }, [phase, r, countdown, secsLeft, play, round.solve, me.id])

  /* ── screens ───────────────────────────────────────────────────────── */
  const card = (meta: (p: Seated) => string) => (p: Seated | null, k?: number) =>
    p ? <ScoreCard key={p.seat} p={p} you={p.id === me.id} value={wins(p)} meta={many && room.out?.[p.id] ? 'left' : meta(p)} /> : <div key={k} className="mt-score" />
  const scoreboard = (meta: (p: Seated) => string) =>
    many ? (
      <div className="mt-ended-many">{seated.map((p) => card(meta)(p))}</div>
    ) : (
      <>
        {card(meta)(seats[0], 0)}
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        {card(meta)(seats[1], 1)}
      </>
    )

  if (endedEarly) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard(() => 'rounds won')} />
  }
  if (phase === 'results' || abandoned) {
    return <Results room={room} me={me} st={st} rounds={rounds} exit={exit} />
  }

  const progressMeta = (p: Seated) => {
    if (phase !== 'play') return 'rounds won'
    const n = p.id === me.id ? picked.length : st.progress?.[p.id]?.r === r ? st.progress[p.id].n : 0
    return '●'.repeat(n) + '○'.repeat(Math.max(0, (target?.length ?? 0) - n))
  }
  const pct = phase === 'play' ? ((round.start + ROUND_MS - now) / ROUND_MS) * 100 : phase === 'countdown' ? 100 : 0
  const hot = phase === 'play' && secsLeft <= 10
  const clock = (
    <div key="clock" className={`mt-clock${hot ? ' mt-clock--hot' : ''}`} role="timer" aria-live="off">
      <span className="label">Time</span>
      <span className="mt-clock__n">{phase === 'play' ? secsLeft : ROUND_MS / 1000}</span>
    </div>
  )
  const hudCard = card(progressMeta)
  const solver = round.solve ? seated.find((p) => p.id === round.solve!.by) : undefined

  return (
    <main className={`ag screen-in${many ? ' ag--many' : ''}`}>
      {/* three or four players: phones put the cards two by two either side of the clock, wide screens in one row */}
      <div className={`mt-hud${many ? ` mt-hud--many mt-hud--${seated.length}` : ''}`}>
        {many ? [...seated.slice(0, 2).map((p) => hudCard(p)), clock, ...seated.slice(2).map((p) => hudCard(p))] : [hudCard(seats[0], 0), clock, hudCard(seats[1], 1)]}
      </div>

      <div className="mt-timebar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} className={hot ? 'hot' : ''} />
      </div>

      <RoundPips rounds={rounds} current={r} seats={seats} />

      {phase === 'reveal' ? (
        <Reveal r={r} round={round} target={target} seats={seats} me={me} last={r === ROUNDS - 1} now={now} />
      ) : (
        <div className="ag-play">
          <p className="label ag-len">
            Round {r + 1} · {scrambled.length} letters
          </p>
          {/* answer: tap a placed letter to send it back */}
          <div
            key={wrong}
            className={`ag-slots${wrong ? ' ag-slots--wrong' : ''}`}
            style={{ ['--n' as string]: scrambled.length }}
            aria-label={`Your answer: ${attempt || 'empty'}`}
          >
            {[...scrambled].map((_, k) => {
              const i = picked[k]
              return (
                <button
                  key={k}
                  type="button"
                  className={`ag-tile ag-slot${i === undefined ? ' ag-slot--empty' : ''}`}
                  onClick={() => unplace(k)}
                  disabled={!canPlay || i === undefined}
                  aria-label={i === undefined ? 'Empty' : `Remove ${scrambled[i]}`}
                >
                  {i === undefined ? '' : scrambled[i]}
                </button>
              )
            })}
          </div>

          {/* the jumbled letters */}
          <div className="ag-pool" style={{ ['--n' as string]: scrambled.length }} data-ult-board>
            {order.map((i) => {
              const used = picked.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  className={`ag-tile${used ? ' ag-tile--used' : ''}`}
                  onClick={() => place(i)}
                  disabled={!canPlay || used}
                  aria-label={phase === 'countdown' ? 'Hidden letter' : `Letter ${scrambled[i]}`}
                >
                  {phase === 'countdown' ? '' : scrambled[i]}
                </button>
              )
            })}
          </div>

          <div className="ag-controls">
            <button type="button" className="btn" onClick={reshuffle} disabled={!canPlay}>
              Shuffle
            </button>
            <button type="button" className="btn" onClick={clear} disabled={!canPlay || !picked.length}>
              Clear
            </button>
          </div>
          <p className="ag-hint hint">
            {claimLost ? `${solver?.name ?? 'Someone'} got there first` : 'Tap the letters in order'}
            <span className="ag-hint--keys"> · or type · space shuffles</span>
          </p>
        </div>
      )}

      {away.map((a) => (
        <p key={a.id} className="mt-banner" role="status">
          {a.name} disconnected · {others.length >= 2 ? 'carrying on without them' : 'ending the match'} in {a.secs}s unless they’re back
        </p>
      ))}

      {(phase === 'countdown' || (phase === 'play' && r === 0 && now - rounds[0].start < GO_MS)) && (
        <Countdown
          label={`Match ${st.match}`}
          n={phase === 'countdown' ? countdown : 0}
          names={many ? seated.map((p) => p.name) : [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']}
          subtitle={`Same letters · ${ROUNDS} rounds · first to solve wins`}
        />
      )}
    </main>
  )
}

/* ── Round progress pips ─────────────────────────────────────────────── */

function RoundPips({ rounds, current, seats }: { rounds: RoundTimes[]; current: number; seats: (Seated | null)[] }) {
  return (
    <ol className="ag-pips" aria-label={`Round ${current + 1} of ${ROUNDS}`}>
      {rounds.map((x, i) => {
        const seat = x.solve ? seats.find((p) => p?.id === x.solve!.by)?.seat : undefined
        const state = i < current || (i === current && x.solve) ? (seat !== undefined ? `won-${seat}` : 'none') : i === current ? 'now' : 'next'
        return (
          <li key={i} className={`ag-pip ag-pip--${state}`}>
            <span>{i + 1}</span>
          </li>
        )
      })}
    </ol>
  )
}

/* ── Between rounds: the answer, who got it, and what it means ──────── */

function Reveal({
  r,
  round,
  target,
  seats,
  me,
  last,
  now,
}: {
  r: number
  round: RoundTimes
  target: string
  seats: (Seated | null)[]
  me: Me
  last: boolean
  now: number
}) {
  const s = round.solve
  const solver = s ? seats.find((p) => p?.id === s.by) ?? null : null
  const word = s?.word ?? target
  const def = useDefinition(word)
  const secs = s ? ((s.at - round.start) / 1000).toFixed(1) : null
  const title = !s ? 'Time’s up' : s.by === me.id ? 'You got it' : `${solver?.name ?? 'They'} got it`
  const left = Math.max(0, Math.ceil((round.revealEnd - now) / 1000))

  return (
    <section className={`ag-reveal ag-reveal--${s ? (s.by === me.id ? 'win' : 'lose') : 'none'}`} aria-live="polite">
      <p className="label">
        Round {r + 1}
        {secs && ` · ${secs}s`}
      </p>
      <h2 className="ag-reveal__title">{title}</h2>
      <div className="ag-reveal__word" style={{ ['--n' as string]: word.length }}>
        {[...word].map((ch, i) => (
          <span key={i} className="ag-tile ag-tile--answer" style={{ animationDelay: `${i * 60}ms` }}>
            {ch}
          </span>
        ))}
      </div>
      {s && s.word !== target && <p className="hint">Also works: {target}</p>}
      <p className="ag-reveal__def">
        {def ? (
          <>
            {def.pos && <i>{def.pos}</i>} {def.text}
          </>
        ) : (
          ' '
        )}
      </p>
      <p className="hint">{last ? 'Final scores…' : `Next round in ${left}…`}</p>
    </section>
  )
}

/* ── Final results ───────────────────────────────────────────────────── */

function Results({ room, me, st, rounds, exit }: { room: Room; me: Me; st: AnagramState; rounds: RoundTimes[]; exit: MatchExit }) {
  const { play } = useSound()
  const players = seatedPlayers(room)
  const seated = players.filter((p): p is Seated => !!p)
  const many = seated.length > 2
  const wins = seated.map((p) => rounds.filter((x) => x.solve?.by === p.id).length)
  // three or four: whoever left mid-match is out of the running (two: the results stand as before)
  const left = (i: number) => many && !!room.out?.[seated[i].id]
  const finished = seated.flatMap((_, i) => (left(i) ? [] : [i]))
  const top = Math.max(...finished.map((i) => wins[i]))
  const atTop = finished.filter((i) => wins[i] === top)
  /** index into `seated`, or -1 on a draw */
  const winner = atTop.length === 1 ? atTop[0] : -1
  const iWon = winner !== -1 && seated[winner].id === me.id
  const name = (i: number) => seated[i]?.name ?? `Player ${i + 1}`

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      play('findBig')
    }
  }, [iWon, play])

  // a rematch is for everyone still in the room, and starts once they're all ready
  const ready = st.ready ?? {}
  const others = stillIn(room).filter((p) => p.id !== me.id)
  const imReady = !!ready[me.id]
  const othersReady = others.length > 0 && others.every((p) => ready[p.id])
  const oppGone = room.status === 'abandoned' || !others.length || others.every((p) => !p.online)

  // the host deals the next five words once everyone is ready
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !othersReady) return
    dealt.current = true
    startMatch(GAME, room.code, { ...initialAnagramState(st.match + 1) })
  }, [me.isHost, imReady, othersReady, room.code, st.match])

  const readyUp = () => {
    play('tap')
    set(ref(db, path(room.code, `state/ready/${me.id}`)), true).catch(() => {})
  }

  const headline = winner === -1 ? 'Draw' : iWon ? 'You win' : `${name(winner)} wins`

  const bySeat = players.map((p) => (p ? wins[seated.indexOf(p)] : 0))
  const rivalry = useRivalryMulti(GAME, room, me, players, bySeat, finished.map((i) => seated[i].seat), st.match)
  const scoreLine = wins.join(' — ')
  const solverOf = (x: RoundTimes) => (x.solve ? seated.find((p) => p.id === x.solve!.by) : undefined)
  const card: CardInput = {
    game: 'Anagram Race',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: seated.map((p, i) => ({ name: p.name, seat: p.seat as SeatN, score: String(wins[i]), meta: left(i) ? 'left' : 'rounds won' })),
    detail: {
      kind: 'rounds',
      rows: rounds.map((x, i) => ({
        word: x.solve?.word ?? st.targets[i],
        seat: (solverOf(x)?.seat ?? null) as SeatN | null,
        note: x.solve ? `${((x.solve.at - x.start) / 1000).toFixed(1)}s` : 'time up',
      })),
    },
  }
  const message = many
    ? multiMessage(seated.map((p) => p.name), winner === -1 ? null : name(winner))
    : shareMessage('Anagram Race', GAME, [name(0), name(1)], winner, scoreLine)
  const winSide = winner !== -1 && seated[winner].seat < 2 ? (seated[winner].seat as 0 | 1) : null

  return (
    <main className="ag ag-results screen-in">
      {iWon && <Confetti />}
      <div className="ag-results__head">
        {winSide !== null && <VsBlock mood="win" side={winSide} eyes size={64} />}
        <p className="label">
          Match {st.match} · final{many ? ` · ${seated.length} players` : ''}
        </p>
        <h1 className={`ag-results__title${iWon ? ' ag-results__title--win' : ''}`}>{headline}</h1>
        <p className="ag-results__line">
          {wins.map((x, i) => (
            <span key={i}>
              {i > 0 && <span> — </span>}
              {x}
            </span>
          ))}
        </p>
        {many && (
          <p className="ag-results__who">
            {seated.map((p, i) => (
              <span key={p.id} className={`ag-results__name ag-results__name--${p.seat}`}>
                {p.id === me.id ? 'You' : p.name}
                {left(i) && ' · left'}
              </span>
            ))}
          </p>
        )}
      </div>

      <ol className="ag-rounds">
        {rounds.map((x, i) => {
          const solver = solverOf(x)
          return (
            <li key={i} className={`ag-round${solver ? ` ag-round--${solver.seat}` : ''}`}>
              <span className="ag-round__n">{i + 1}</span>
              <span className="ag-round__word">{x.solve?.word ?? st.targets[i]}</span>
              <span className="ag-round__who">
                {solver ? `${solver.id === me.id ? 'You' : solver.name} · ${((x.solve!.at - x.start) / 1000).toFixed(1)}s` : 'Nobody'}
              </span>
            </li>
          )
        })}
      </ol>

      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={message}
        oppName={others.map((p) => p.name).join(' & ') || undefined}
        imReady={imReady}
        oppReady={othersReady}
        oppGone={oppGone}
        onReady={readyUp}
        onLeave={exit.now}
      />
    </main>
  )
}

/** The share text for a 3–4 player match. */
function multiMessage(names: string[], winner: string | null) {
  const url = `${location.origin}/${GAME}`
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0])
  if (!winner) return `${list(names)} played Anagram Race on Lash vs Seven and it ended level. Your turn: ${url}`
  return `${winner} won Anagram Race against ${list(names.filter((x) => x !== winner))} on Lash vs Seven. Think you can do better? ${url}`
}
