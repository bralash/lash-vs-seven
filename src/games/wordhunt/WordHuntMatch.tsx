import { ref, set } from 'firebase/database'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/firebase'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { useScrollLock } from '../../lib/useScrollLock'
import { useServerNow } from '../../lib/serverTime'
import { useSound } from '../../lib/sound'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { roomPath, seatedPlayers, startMatch, stillIn, type Room } from '../../lobby/rooms'
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

  const seats = seatedPlayers(room)
  const seated = seats.filter((p): p is Seated => !!p)
  const many = seated.length > 2

  const abandoned = room.status === 'abandoned'
  // Abandoned before the clock ran out = the match never finished; after it = results still stand.
  const endedEarly = abandoned && (room.endedAt ?? 0) < playTo + GRACE_MS
  const inRound = !abandoned && phase !== 'results'

  // Refresh / closing the tab mid-round gets the browser's own "Leave site?" prompt.
  useBeforeUnload(inRound && phase !== 'grace')
  // Phones: the round screen is pinned — swiping the board must never scroll or pan the page.
  useScrollLock(inRound)

  // Someone dropped mid-round: they get a short window to come back. With two players that ends the
  // match; with three or four the rest carry on without them.
  const others = stillIn(room).filter((p) => p.id !== me.id)
  const away = useAwayPlayers(GAME, room.code, others, inRound)

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
  // A new grid (next game, rematch) starts clean: the last word's flash would otherwise replay on
  // the same squares once the new letters finish flipping in, lighting random letters green.
  const gridKey = grid.join('')
  useEffect(() => {
    setFlash(null)
    setFeedback(null)
  }, [gridKey])

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
  const card = (p: Seated | null, k?: number) =>
    p ? (
      <ScoreCard
        key={p.seat}
        p={p}
        you={p.id === me.id}
        score={scoreOf(p)}
        value={scoreOf(p).toLocaleString()}
        meta={many && room.out?.[p.id] ? 'left' : wordsLabel(countOf(p))}
      />
    ) : (
      <div key={k} className="mt-score" />
    )

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
          many ? (
            <div className="sp-hud-many">{seated.map((p) => card(p))}</div>
          ) : (
            <>
              {card(seats[0], 0)}
              <span className="mt-ended__vs" aria-hidden="true">vs</span>
              {card(seats[1], 1)}
            </>
          )
        }
      />
    )
  }
  if (phase === 'results' || abandoned) {
    return <Results room={room} me={me} st={st} mine={mine} grid={grid} exit={exit} />
  }

  const pct = phase === 'play' ? ((playTo - now) / ROUND_MS) * 100 : phase === 'countdown' ? 100 : 0
  const clock = (
    <div key="clock" className={`mt-clock${phase === 'play' && secsLeft <= 10 ? ' mt-clock--hot' : ''}`} role="timer" aria-live="off">
      <span className="label">Time</span>
      <span className="mt-clock__n">{phase === 'countdown' ? ROUND_MS / 1000 : secsLeft}</span>
    </div>
  )

  return (
    <main className={`wh screen-in${many ? ' wh--many' : ''}`}>
      {/* three or four players: phones put the cards two by two either side of the clock, wide screens in one row */}
      <div className={`mt-hud${many ? ` wh-hud wh-hud--${seated.length}` : ''}`}>
        {many ? [...seated.slice(0, 2).map((p) => card(p)), clock, ...seated.slice(2).map((p) => card(p))] : [card(seats[0], 0), clock, card(seats[1], 1)]}
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

      {away.map((a) => (
        <p key={a.id} className="mt-banner" role="status">
          {a.name} disconnected · {others.length >= 2 ? 'carrying on without them' : 'ending the match'} in {a.secs}s unless they’re back
        </p>
      ))}

      {(phase === 'countdown' || (phase === 'play' && now - playFrom < GO_MS)) && (
        <Countdown
          label={`Round ${st.round}`}
          n={phase === 'countdown' ? countdown : 0}
          names={many ? seated.map((p) => p.name) : [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']}
          subtitle={`Same grid · ${ROUND_MS / 1000} seconds · most points wins`}
        />
      )}

    </main>
  )
}



/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, mine, grid, exit }: { room: Room; me: Me; st: WordHuntState; mine: string[]; grid: string[]; exit: MatchExit }) {
  const { play } = useSound()
  const players = seatedPlayers(room)
  const seated = players.filter((p): p is Seated => !!p)
  const many = seated.length > 2
  const wordsOf = (p: Seated) => (p.id === me.id ? mine : st.found?.[p.id] ?? [])
  const lists = seated.map(wordsOf)
  const scores = lists.map(totalScore)
  // three or four: whoever left mid-match is out of the running (two: the results stand as before)
  const left = (i: number) => many && !!room.out?.[seated[i].id]
  const finished = seated.flatMap((_, i) => (left(i) ? [] : [i]))
  const top = Math.max(...finished.map((i) => scores[i]))
  const atTop = finished.filter((i) => scores[i] === top)
  /** index into `seated`, or -1 on a draw */
  const winner = atTop.length === 1 ? atTop[0] : -1
  const iWon = winner !== -1 && seated[winner].id === me.id
  const name = (i: number) => seated[i]?.name ?? `Player ${i + 1}`

  const foundKey = lists.map((l) => l.join(',')).join('|')
  const missed = useMemo(() => {
    const got = new Set(foundKey.split(/[,|]/))
    return [...solve(grid)].filter((w) => !got.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b))
  }, [grid, foundKey])

  // a rematch is for everyone still in the room, and starts once they're all ready
  const ready = st.ready ?? {}
  const inRoom = stillIn(room)
  const others = inRoom.filter((p) => p.id !== me.id)
  const imReady = !!ready[me.id]
  const othersReady = others.length > 0 && others.every((p) => ready[p.id])
  // everyone else left after the round: results stand, but there's no one to rematch
  const oppGone = room.status === 'abandoned' || !others.length || others.every((p) => !p.online)

  const cheered = useRef(false)
  useEffect(() => {
    if (iWon && !cheered.current) {
      cheered.current = true
      play('findBig')
    }
  }, [iWon, play])

  // The host deals the next grid once everyone is ready.
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !othersReady) return
    dealt.current = true
    startMatch(GAME, room.code, { ...initialWordHuntState(st.round + 1) })
  }, [me.isHost, imReady, othersReady, room.code, st.round])

  const readyUp = () => {
    play('tap')
    set(ref(db, `${roomPath(GAME, room.code)}/state/ready/${me.id}`), true).catch(() => {})
  }

  const headline = winner === -1 ? 'Draw' : iWon ? 'You win' : `${name(winner)} wins`

  const bySeat = players.map((p) => (p ? scores[seated.indexOf(p)] : 0))
  const rivalry = useRivalryMulti(GAME, room, me, players, bySeat, finished.map((i) => seated[i].seat), st.round)
  const scoreLine = scores.map((x) => x.toLocaleString()).join(' — ')
  // share card: spotlight the winner's best word (yours on a draw)
  const featured = winner >= 0 ? winner : Math.max(0, seated.findIndex((p) => p.id === me.id))
  const best = [...lists[featured]].sort((a, b) => score(b) - score(a) || b.length - a.length)[0]
  const foundByOthers = (i: number) => new Set(lists.filter((_, j) => j !== i).flat())
  const theirs = foundByOthers(featured)
  const unique = lists[featured].filter((x) => !theirs.has(x)).length
  const card: CardInput = {
    game: 'Word Hunt',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: seated.map((p, i) => ({ name: p.name, seat: p.seat as SeatN, score: scores[i].toLocaleString(), meta: left(i) ? 'left' : wordsLabel(lists[i].length) })),
    detail: {
      kind: 'grid',
      letters: grid,
      path: best ? pathOf(grid, best) ?? [] : [],
      word: best ?? '—',
      points: best ? `+${score(best).toLocaleString()}` : '',
      stats: [['Words found', lists.map((l) => l.length).join(' — ')], ['Unique words', String(unique)]],
    },
  }
  const message = many
    ? multiMessage(seated.map((p) => p.name), winner === -1 ? null : name(winner))
    : shareMessage('Word Hunt', GAME, [name(0), name(1)], winner as 0 | 1 | -1, scoreLine)
  const winSide = winner !== -1 && seated[winner].seat < 2 ? (seated[winner].seat as 0 | 1) : null

  return (
    <main className="wh wh-results screen-in">
      {iWon && <Confetti />}
      <div className="wh-results__head">
        {winSide !== null && <VsBlock mood="win" side={winSide} eyes size={64} />}
        <p className="label">
          Round {st.round} · final{many ? ` · ${seated.length} players` : ''}
        </p>
        <h1 className={`wh-results__title${iWon ? ' wh-results__title--win' : ''}`}>{headline}</h1>
        <p className="wh-results__line">
          {scores.map((x, i) => (
            <span key={i} className="wh-results__n">
              {i > 0 && <span>—</span>}
              {x.toLocaleString()}
            </span>
          ))}
        </p>
      </div>

      <div className="wh-cols">
        {seated.map((p, i) => {
          const other = foundByOthers(i)
          const sorted = [...lists[i]].sort((a, b) => b.length - a.length || a.localeCompare(b))
          return (
            <section key={p.id} className={`wh-col wh-col--${p.seat}${winner === i ? ' wh-col--win' : ''}`}>
              <header>
                <span className="wh-col__name">
                  {p.name}
                  {p.id === me.id && <em> · you</em>}
                  {left(i) && <em> · left</em>}
                </span>
                <span className="wh-col__score">{scores[i].toLocaleString()}</span>
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
  if (!winner) return `${list(names)} played Word Hunt on Lash vs Seven and it ended level. Your turn: ${url}`
  return `${winner} won Word Hunt against ${list(names.filter((x) => x !== winner))} on Lash vs Seven. Think you can do better? ${url}`
}
