import { ref, set } from 'firebase/database'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/firebase'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import { useServerNow } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, roomPath, startMatch, type Room } from '../../lobby/rooms'
import { Board, type Flash } from './Board'
import {
  COUNTDOWN_MS,
  MIN_LEN,
  ROUND_MS,
  generateGrid,
  pathOf,
  isWord,
  score,
  solve,
  totalScore,
} from './engine'
import { Confetti } from '../../match/Confetti'
import { shareLink, shareMessage } from '../../match/share'
import { ShareResult } from '../../match/ShareResult'
import { RivalryLine } from '../../match/RivalryLine'
import { useRivalry } from '../../match/useRivalry'
import type { CardInput } from '../../match/shareCard'
import { Countdown } from '../../match/Countdown'
import { MatchEnded } from '../../match/MatchEnded'
import { ScoreCard } from '../../match/ScoreCard'
import type { Seated } from '../../match/types'
import { useOpponentAway } from '../../match/useOpponentAway'
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

const wordsLabel = (n: number) => `${n} ${n === 1 ? 'word' : 'words'}`

export const initialWordHuntState = (round = 1): WordHuntState => ({ grid: generateGrid(), round })

type Phase = 'countdown' | 'play' | 'grace' | 'results'

interface Feedback {
  text: string
  kind: 'good' | 'bad' | 'dupe'
  id: number
}

export function WordHuntMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
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

  const abandoned = room.status === 'abandoned'
  // Abandoned before the clock ran out = the match never finished; after it = results still stand.
  const endedEarly = abandoned && (room.endedAt ?? 0) < playTo + GRACE_MS
  const inRound = !abandoned && phase !== 'results'

  // Refresh / closing the tab mid-round gets the browser's own "Leave site?" prompt.
  useBeforeUnload(inRound && phase !== 'grace')
  // Phones: the round screen is pinned — swiping the board must never scroll or pan the page.
  useScrollLock(inRound)

  // Opponent dropped mid-round: they get a short window to come back before the match ends.
  const awaySecs = useOpponentAway(GAME, room.code, opp, inRound)

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

  const scoreOf = (p: Seated | null) => (p ? totalScore(p.id === me.id ? mine : st.found?.[p.id] ?? []) : 0)
  const countOf = (p: Seated | null) => (p ? (p.id === me.id ? mine : st.found?.[p.id] ?? []).length : 0)

  const liveWord = live.map((i) => grid[i]).join('')
  const best = mine.reduce<string | null>((b, w) => (!b || score(w) > score(b) || (score(w) === score(b) && w.length > b.length) ? w : b), null)
  const liveState = liveWord.length >= MIN_LEN ? (mine.includes(liveWord) ? 'dupe' : isWord(liveWord) ? 'good' : '') : ''

  if (endedEarly) {
    return (
      <MatchEnded
        room={room}
        me={me}
        seats={seats}
        exit={exit}
        scoreboard={
          <>
            <ScoreCard p={seats[0]} you={me.seat === 0} value={scoreOf(seats[0]).toLocaleString()} meta={wordsLabel(countOf(seats[0]))} />
            <span className="mt-ended__vs" aria-hidden="true">vs</span>
            <ScoreCard p={seats[1]} you={me.seat === 1} value={scoreOf(seats[1]).toLocaleString()} meta={wordsLabel(countOf(seats[1]))} />
          </>
        }
      />
    )
  }
  if (phase === 'results' || abandoned) {
    return <Results room={room} me={me} st={st} mine={mine} seats={seats} grid={grid} exit={exit} />
  }

  const pct = phase === 'play' ? ((playTo - now) / ROUND_MS) * 100 : phase === 'countdown' ? 100 : 0

  return (
    <main className="wh screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={me.seat === 0} value={scoreOf(seats[0]).toLocaleString()} meta={wordsLabel(countOf(seats[0]))} />
        <div className={`mt-clock${phase === 'play' && secsLeft <= 10 ? ' mt-clock--hot' : ''}`} role="timer" aria-live="off">
          <span className="label">Time</span>
          <span className="mt-clock__n">{phase === 'countdown' ? ROUND_MS / 1000 : secsLeft}</span>
        </div>
        <ScoreCard p={seats[1]} you={me.seat === 1} value={scoreOf(seats[1]).toLocaleString()} meta={wordsLabel(countOf(seats[1]))} />
      </div>

      <div className="mt-timebar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} className={secsLeft <= 10 && phase === 'play' ? 'hot' : ''} />
      </div>

      {/* phones: the stage takes whatever height is left and the board stays square inside it */}
      <div className="wh-stage">
        <Board grid={grid} hidden={phase === 'countdown'} disabled={phase !== 'play'} flash={flash} onPathChange={setLive} onTrace={(p) => submit(p.map((i) => grid[i]).join(''), p)} />
      </div>

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

      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}

      {(phase === 'countdown' || (phase === 'play' && now - playFrom < GO_MS)) && (
        <Countdown
          label={`Round ${st.round}`}
          n={phase === 'countdown' ? countdown : 0}
          names={[seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']}
          subtitle={`Same grid · ${ROUND_MS / 1000} seconds · most points wins`}
        />
      )}

    </main>
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
  exit,
}: {
  room: Room
  me: Me
  st: WordHuntState
  mine: string[]
  seats: [Seated | null, Seated | null]
  grid: string[]
  exit: MatchExit
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
  // the opponent left after the round: results stand, but there's no one to rematch
  const over = room.status === 'abandoned'
  const oppGone = over || !opp?.online

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      play('findBig')
    }
  }, [iWon, play])

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

  // share card: spotlight the winner's best word (yours on a draw)
  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.round)
  const scoreLine = `${scores[0].toLocaleString()} — ${scores[1].toLocaleString()}`
  const featured = winner >= 0 ? winner : me.seat
  const best = [...lists[featured]].sort((a, b) => score(b) - score(a) || b.length - a.length)[0]
  const unique = lists[featured].filter((x) => !lists[1 - featured].includes(x)).length
  const card: CardInput = {
    game: 'Word Hunt',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((s) => ({ name: names[s], seat: s as 0 | 1, score: scores[s].toLocaleString(), meta: wordsLabel(lists[s].length) })) as CardInput['players'],
    detail: {
      kind: 'grid',
      letters: grid,
      path: best ? pathOf(grid, best) ?? [] : [],
      word: best ?? '—',
      points: best ? `+${score(best).toLocaleString()}` : '',
      stats: [['Words found', `${lists[0].length} — ${lists[1].length}`], ['Unique words', String(unique)]],
    },
  }

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

      <RivalryLine r={rivalry} />
      <div className="mt-share">
        <ShareResult card={card} won={iWon} message={shareMessage('Word Hunt', GAME, names, winner, scoreLine)} />
      </div>

      <div className="mt-actions" aria-live="polite">
        <button type="button" className="btn btn--primary btn--lg" onClick={readyUp} disabled={imReady || oppGone}>
          {oppGone ? `${opp?.name ?? 'Opponent'} left` : imReady ? (oppReady ? 'Dealing…' : 'Ready — waiting') : oppReady ? `Rematch — ${opp.name} is ready` : 'Play again'}
          <span className="keycap">↵</span>
        </button>
        <button type="button" className="btn" onClick={over ? exit.now : exit.request}>
          {over ? 'Back to lobby' : 'Leave room'}
        </button>
      </div>
    </main>
  )
}
