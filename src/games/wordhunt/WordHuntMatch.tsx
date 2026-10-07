import { ref, set } from 'firebase/database'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { db } from '../../lib/firebase'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useServerNow } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import type { Me } from '../../lobby/Lobby'
import { playersBySeat, roomPath, startMatch, type Player, type Room } from '../../lobby/rooms'
import { Board, type Flash } from './Board'
import {
  COUNTDOWN_MS,
  MAX_LEN,
  MIN_LEN,
  ROUND_MS,
  findPath,
  generateGrid,
  isWord,
  score,
  solve,
  totalScore,
} from './engine'
import { Confetti } from './Confetti'
import { Countdown } from './Countdown'
import '../../styles/wordhunt.css'

export interface WordHuntState {
  grid: string[]
  round: number
  found?: Record<string, string[]>
  ready?: Record<string, boolean>
}

const GAME = 'wordhunt'
/** Time after the clock hits zero for both players' last words to land before results. */
const GRACE_MS = 1500
/** How long the "GO!" beat stays up once the clock starts. */
const GO_MS = 650

export const initialWordHuntState = (round = 1): WordHuntState => ({ grid: generateGrid(), round })

type Phase = 'countdown' | 'play' | 'grace' | 'results'
type Seated = Player & { id: string }

interface Feedback {
  text: string
  kind: 'good' | 'bad' | 'dupe'
  id: number
}

export function WordHuntMatch({ room, me, requestLeave }: { room: Room; me: Me; requestLeave: () => void }) {
  const st = room.state as unknown as WordHuntState
  const grid = st.grid
  const now = useServerNow(100)
  const { play } = useSound()

  const startAt = room.startedAt ?? now
  const playFrom = startAt + COUNTDOWN_MS
  const playTo = playFrom + ROUND_MS
  const phase: Phase = now < playFrom ? 'countdown' : now < playTo ? 'play' : now < playTo + GRACE_MS ? 'grace' : 'results'

  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]

  // Refresh / closing the tab mid-round gets the browser's own "Leave site?" prompt.
  useBeforeUnload(phase === 'countdown' || phase === 'play')

  // My words are kept locally (instant feedback) and mirrored to the room for the opponent.
  const [mine, setMine] = useState<string[]>(() => st.found?.[me.id] ?? [])

  // Arrive at the top of the board, not wherever the lobby was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [st.round])
  const roundRef = useRef(st.round)
  useEffect(() => {
    if (roundRef.current !== st.round) {
      roundRef.current = st.round
      setMine(st.found?.[me.id] ?? [])
    }
  }, [st.round, st.found, me.id])

  const [live, setLive] = useState<number[]>([])
  const [flash, setFlash] = useState<Flash | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 1100)
    return () => clearTimeout(t)
  }, [feedback])

  // sound on phase changes + last-10-seconds ticks
  const secsLeft = Math.max(0, Math.ceil((playTo - now) / 1000))
  const countdown = Math.max(1, Math.ceil((playFrom - now) / 1000))
  const lastBeat = useRef<string>('')
  useEffect(() => {
    const beat = phase === 'countdown' ? `c${countdown}` : phase === 'play' ? `p${secsLeft}` : phase
    if (beat === lastBeat.current) return
    const prev = lastBeat.current
    lastBeat.current = beat
    if (!prev) return // no sound on first render (e.g. after a refresh)
    if (phase === 'countdown') play('tick')
    else if (phase === 'play' && prev.startsWith('c')) play('start')
    else if (phase === 'play' && secsLeft <= 10) play('tick')
    else if (phase === 'grace') play('end')
  }, [phase, countdown, secsLeft, play])

  const submit = (word: string, path: number[]) => {
    if (phase !== 'play') return
    const id = Date.now()
    let kind: Feedback['kind'] = 'bad'
    let text: string
    if (word.length < MIN_LEN) text = `${MIN_LEN}+ letters`
    else if (mine.includes(word)) {
      kind = 'dupe'
      text = `${word} · already found`
    } else if (!isWord(word)) text = `${word} · not in the word list`
    else {
      kind = 'good'
      const pts = score(word)
      text = `${word} +${pts}`
      const next = [...mine, word]
      setMine(next)
      set(ref(db, `${roomPath(GAME, room.code)}/state/found/${me.id}`), next).catch(() => {})
      play(word.length >= 5 ? 'findBig' : 'find')
    }
    if (kind === 'bad') play('error')
    setFlash({ cells: path, kind, id })
    setFeedback({ text, kind, id })
  }

  const onType = (e: FormEvent) => {
    e.preventDefault()
    const word = typed
    setTyped('')
    if (!word) return
    const path = findPath(grid, word)
    if (!path) {
      play('error')
      setFeedback({ text: `${word} · not on the grid`, kind: 'bad', id: Date.now() })
      return
    }
    submit(word, path)
  }

  const scoreOf = (p: Seated | null) => (p ? totalScore(p.id === me.id ? mine : st.found?.[p.id] ?? []) : 0)
  const countOf = (p: Seated | null) => (p ? (p.id === me.id ? mine : st.found?.[p.id] ?? []).length : 0)

  const liveWord = live.map((i) => grid[i]).join('')
  const best = mine.reduce<string | null>((b, w) => (!b || score(w) > score(b) || (score(w) === score(b) && w.length > b.length) ? w : b), null)
  const liveState = liveWord.length >= MIN_LEN ? (mine.includes(liveWord) ? 'dupe' : isWord(liveWord) ? 'good' : '') : ''

  if (phase === 'results') {
    return <Results room={room} me={me} st={st} mine={mine} seats={seats} grid={grid} requestLeave={requestLeave} />
  }

  const pct = phase === 'play' ? ((playTo - now) / ROUND_MS) * 100 : phase === 'countdown' ? 100 : 0
  const pointerFine = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches

  return (
    <main className="wh screen-in">
      <div className="wh-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} score={scoreOf(seats[0])} count={countOf(seats[0])} />
        <div className={`wh-clock${phase === 'play' && secsLeft <= 10 ? ' wh-clock--hot' : ''}`} role="timer" aria-live="off">
          <span className="label">Time</span>
          <span className="wh-clock__n">{phase === 'countdown' ? ROUND_MS / 1000 : secsLeft}</span>
        </div>
        <ScoreCard p={seats[1]} you={me.seat === 1} score={scoreOf(seats[1])} count={countOf(seats[1])} />
      </div>

      <div className="wh-timebar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} className={secsLeft <= 10 && phase === 'play' ? 'hot' : ''} />
      </div>

      <Board grid={grid} hidden={phase === 'countdown'} disabled={phase !== 'play'} flash={flash} onPathChange={setLive} onTrace={(p) => submit(p.map((i) => grid[i]).join(''), p)} />

      {/* desktop: one panel beside the board; phones: display: contents keeps the stacked order */}
      <div className="wh-side">
        <div className={`wh-word wh-word--${feedback && !live.length ? feedback.kind : liveState}`} aria-live="polite">
          {live.length ? (
            <>
              <span>{liveWord}</span>
              {liveState === 'good' && <b>+{score(liveWord)}</b>}
            </>
          ) : feedback ? (
            <span key={feedback.id} className="wh-word__fb">{feedback.text}</span>
          ) : (
            <span className="wh-word__hint">{phase === 'play' ? 'Drag across the letters' : phase === 'grace' ? 'Time!' : 'Get ready'}</span>
          )}
        </div>

        <form className="wh-type" onSubmit={onType}>
          <span aria-hidden="true">&gt;</span>
          <label className="visually-hidden" htmlFor="wh-type">Type a word</label>
          <input
            id="wh-type"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_LEN))}
            placeholder="…or type a word"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={phase !== 'play'}
            autoFocus={pointerFine}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          />
          <button type="submit" className="btn btn--primary" disabled={phase !== 'play'}>
            Enter <span className="keycap">↵</span>
          </button>
        </form>

        <section className="wh-found" aria-label={`Your words: ${mine.length}`}>
          <p className="wh-found__head">
            <span className="label">Your words · {mine.length}</span>
            <span className="label">{totalScore(mine).toLocaleString()} pts</span>
          </p>
          <ul>
            {[...mine].reverse().map((w) => (
              <li key={w} className="chip">
                {w}
                <b>{score(w)}</b>
              </li>
            ))}
          </ul>
        </section>
        {best && (
          <p className="wh-best">
            <span className="label">Best word</span>
            <b>{best}</b>
            <span className="wh-best__pts">+{score(best)}</span>
          </p>
        )}
      </div>

      {opp && !opp.online && <p className="wh-banner" role="status">{opp.name} disconnected — waiting for them to come back</p>}

      {(phase === 'countdown' || (phase === 'play' && now - playFrom < GO_MS)) && (
        <Countdown
          round={st.round}
          n={phase === 'countdown' ? countdown : 0}
          names={[seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']}
          seconds={ROUND_MS / 1000}
        />
      )}

    </main>
  )
}

function ScoreCard({ p, you, score, count }: { p: Seated | null; you: boolean; score: number; count: number }) {
  if (!p) return <div className="wh-score" />
  return (
    <div className={`wh-score wh-score--${p.seat}${you ? ' wh-score--you' : ''}`}>
      <span className="wh-score__name">
        {p.name}
        {you && <em> · you</em>}
        {!p.online && <em> · away</em>}
      </span>
      <span className="wh-score__n">{score.toLocaleString()}</span>
      <span className="wh-score__meta">{count} {count === 1 ? 'word' : 'words'}</span>
    </div>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({
  room,
  me,
  st,
  mine,
  seats,
  grid,
  requestLeave,
}: {
  room: Room
  me: Me
  st: WordHuntState
  mine: string[]
  seats: [Seated | null, Seated | null]
  grid: string[]
  requestLeave: () => void
}) {
  const { play } = useSound()
  const wordsOf = (p: Seated | null) => (p ? (p.id === me.id ? mine : st.found?.[p.id] ?? []) : [])
  const lists = [wordsOf(seats[0]), wordsOf(seats[1])]
  const scores = lists.map(totalScore)
  const winner = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1
  const iWon = winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]

  const foundKey = lists.map((l) => l.join(',')).join('|')
  const missed = useMemo(() => {
    const got = new Set(foundKey.split(/[,|]/))
    return [...solve(grid)].filter((w) => !got.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b))
  }, [grid, foundKey])

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])

  useEffect(() => {
    if (winner === me.seat) play('findBig')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The host deals the next grid once both players are ready.
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    startMatch(GAME, room.code, { ...initialWordHuntState(st.round + 1) })
  }, [me.isHost, imReady, oppReady, room.code, st.round])

  const readyUp = () => {
    play('tap')
    set(ref(db, `${roomPath(GAME, room.code)}/state/ready/${me.id}`), true).catch(() => {})
  }

  const headline = winner === -1 ? 'Draw' : iWon ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`

  return (
    <main className="wh wh-results screen-in">
      {iWon && <Confetti />}
      <div className="wh-results__head">
        <p className="label">Round {st.round} · final</p>
        <h1 className={`wh-results__title${iWon ? ' wh-results__title--win' : ''}`}>{headline}</h1>
        <p className="wh-results__line">
          {scores[0].toLocaleString()} <span>—</span> {scores[1].toLocaleString()}
        </p>
      </div>

      <div className="wh-cols">
        {seats.map((p, s) => {
          const other = new Set(lists[1 - s])
          const sorted = [...lists[s]].sort((a, b) => b.length - a.length || a.localeCompare(b))
          return (
            <section key={s} className={`wh-col wh-col--${s}${winner === s ? ' wh-col--win' : ''}`}>
              <header>
                <span className="wh-col__name">{p?.name ?? '—'}{p?.id === me.id && <em> · you</em>}</span>
                <span className="wh-col__score">{scores[s].toLocaleString()}</span>
              </header>
              {sorted.length ? (
                <ul>
                  {sorted.map((w) => {
                    const only = !other.has(w)
                    return (
                      <li key={w} className={only ? 'only' : ''}>
                        <span>{w}</span>
                        {only && <span className="stamp">Only</span>}
                        <b>+{score(w)}</b>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="wh-col__empty">No words this round</p>
              )}
            </section>
          )
        })}
      </div>

      {missed.length > 0 && (
        <section className="wh-missed">
          <p className="label">Nobody found · {missed.length} words</p>
          <ul>
            {missed.slice(0, 14).map((w) => (
              <li key={w}>{w}<b>{score(w)}</b></li>
            ))}
          </ul>
        </section>
      )}

      <div className="wh-actions" aria-live="polite">
        <button type="button" className="btn btn--primary btn--lg" onClick={readyUp} disabled={imReady || !opp?.online}>
          {!opp?.online ? `${opp?.name ?? 'Opponent'} left` : imReady ? (oppReady ? 'Dealing…' : 'Ready — waiting') : oppReady ? `Rematch — ${opp.name} is ready` : 'Play again'}
          <span className="keycap">↵</span>
        </button>
        <button type="button" className="btn" onClick={requestLeave}>Leave room</button>
      </div>
    </main>
  )
}
