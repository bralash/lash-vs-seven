import { useCallback, useEffect, useRef, useState } from 'react'
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
import { AnswerTiles, ClueLists, Grid, Keys } from './Board'
import { RESULT_MS, answer, colours, count, freshLive, layout, makePuzzle, pass, squares, type Live, type Puzzle } from './engine'
import { THEME_LABEL, type Theme } from './words'
import '../../styles/crossword.css'

const GAME = 'crossword'
const COLOUR = ['Orange', 'Blue'] as const
const words = (n: number) => `${n} word${n === 1 ? '' : 's'}`

export interface CrosswordState {
  theme: Theme
  match: number
  puzzle: Puzzle
  live: Live
  ready?: Record<string, boolean>
}

export function initialCrosswordState(theme: Theme = 'ghana', match = 1): CrosswordState {
  const puzzle = makePuzzle(theme)
  // who answers first alternates between matches
  return { theme, match, puzzle, live: freshLive(puzzle, (match % 2 === 1 ? 0 : 1) as Seat) }
}

/** The next open word after `from` (wrapping), or -1 when every word is claimed. */
const nextOpen = (owners: string, from: number, step = 1) => {
  const n = owners.length
  for (let k = 1; k <= n; k++) {
    const w = (((from + step * k) % n) + n) % n
    if (owners[w] === '.') return w
  }
  return -1
}

export function CrosswordMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as CrosswordState
  const { puzzle, live } = st
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const mine = (s: Seat) => !session.local && s === me.seat
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const score = (s: Seat) => count(live.owners, s)
  const left = live.owners.split('').filter((v) => v === '.').length

  const over = !!live.result
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over

  useBeforeUnload(inMatch)
  useScrollLock(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)
  const myTurn = inMatch && live.turn === me.seat

  const painted = colours(puzzle, live)
  const sqs = layout(puzzle)

  // the word being answered and what's been spelled for it (' ' = blank)
  const [sel, setSel] = useState(() => nextOpen(live.owners, -1))
  const [draft, setDraft] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const selected = sel >= 0 && live.owners[sel] === '.' ? sel : -1
  const cells = selected >= 0 ? squares(puzzle, selected) : []
  // letters already in place from words claimed across this one
  const known = cells.map((i) => (painted[i] !== '.' ? sqs[i]!.letter : ' ')).join('')
  const spelled = Array.from(known, (c, k) => (c !== ' ' ? c : draft[k] ?? ' ')).join('')
  const full = selected >= 0 && !spelled.includes(' ')
  const cursor = spelled.indexOf(' ')

  const pick = useCallback((w: number) => {
    setSel(w)
    setDraft('')
  }, [])

  // a claimed word can't stay selected: move on to the next open one
  useEffect(() => {
    if (sel >= 0 && live.owners[sel] !== '.') pick(nextOpen(live.owners, sel))
    else if (sel < 0 && live.owners.includes('.')) pick(nextOpen(live.owners, -1))
  }, [live.owners, sel, pick])

  // on one device the next player shouldn't inherit the last one's half-spelled word
  const movesRef = useRef(live.moves)
  useEffect(() => {
    if (session.local && live.moves !== movesRef.current) setDraft('')
    movesRef.current = live.moves
  }, [live.moves, session.local])

  const tapSquare = (i: number) => {
    const sq = sqs[i]
    if (!sq) return
    const open = [sq.across, sq.down].filter((w) => w >= 0 && live.owners[w] === '.')
    if (!open.length) return
    sound('tap')
    // tapping inside the selected word again flips to the crossing one
    pick(open.length === 2 && open[0] === selected ? open[1] : open.includes(selected) ? selected : open[0])
  }

  // both work from the latest draft, so quick taps between renders never land on the same square
  const merge = (d: string) => Array.from(known, (c, k) => (c !== ' ' ? c : d[k] ?? ' '))
  const type = (l: string) => {
    if (selected < 0 || cursor < 0) return
    sound('tap')
    setDraft((prev) => {
      const d = merge(prev)
      const at = d.indexOf(' ')
      if (at >= 0) d[at] = l
      return d.join('')
    })
  }
  const back = () => {
    if (selected < 0) return
    sound('tap')
    setDraft((prev) => {
      const d = merge(prev)
      // the last letter you placed (fixed letters can't be taken back)
      for (let k = d.length - 1; k >= 0; k--) {
        if (known[k] === ' ' && d[k] !== ' ') {
          d[k] = ' '
          break
        }
      }
      return d.join('')
    })
  }
  const submit = () => {
    if (!myTurn || !full || busy) return
    const w = selected
    const guess = spelled
    setBusy(true)
    session
      .move<Live>((cur) => answer(cur, puzzle, me.seat, w, guess))
      .catch(() => false)
      .finally(() => setBusy(false))
  }
  const skip = () => {
    if (!myTurn || busy) return
    sound('tap')
    setBusy(true)
    session
      .move<Live>((cur) => pass(cur, me.seat))
      .catch(() => false)
      .finally(() => setBusy(false))
  }

  // a physical keyboard works too
  const keyRef = useRef({ type, back, submit })
  keyRef.current = { type, back, submit }
  useEffect(() => {
    if (!inMatch) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[a-z]$/i.test(e.key)) keyRef.current.type(e.key.toUpperCase())
      else if (e.key === 'Backspace') keyRef.current.back()
      else if (e.key === 'Enter') keyRef.current.submit()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inMatch])

  // react to every answer: sounds, the wrong-answer shake, the claimed word stamping in
  const [fresh, setFresh] = useState<number[]>()
  const seenRef = useRef({ moves: live.moves, result: over })
  useEffect(() => {
    const seen = seenRef.current
    if (live.moves !== seen.moves && live.last) {
      const { seat, w, ok } = live.last
      const byMe = session.local || seat === me.seat
      if (w >= 0 && ok) {
        setFresh(squares(puzzle, w))
        sound(byMe ? 'find' : 'tick')
      } else if (w >= 0) {
        if (byMe) {
          setShake((n) => n + 1)
          setDraft('')
        }
        sound(byMe ? 'error' : 'tick')
      } else if (!byMe) sound('tick')
    }
    if (live.result && !seen.result) {
      const win = live.result.winner
      sound((session.local ? win !== -1 : win === me.seat) ? 'findBig' : win === -1 ? 'join' : 'end')
    }
    seenRef.current = { moves: live.moves, result: !!live.result }
  }, [live.moves, live.last, live.result, me.seat, puzzle, session.local, sound])

  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && inMatch && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · words`} />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && inMatch && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · words`} />
    </>
  )

  if (abandoned && !over) {
    return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  }
  if (showResults) {
    return <Results room={room} me={me} st={st} seats={seats} exit={exit} />
  }

  // what just happened, then whose turn it is
  const last = live.last
  const said = (s: Seat) => (mine(s) ? 'You' : name(s))
  const event = !last
    ? ''
    : last.w < 0
      ? `${said(last.seat)} passed`
      : last.ok
        ? `${said(last.seat)} got ${last.guess}`
        : `${said(last.seat)} tried ${last.guess} for ${puzzle.words[last.w].num} ${puzzle.words[last.w].dir === 'A' ? 'across' : 'down'}`
  const status = live.result
    ? live.result.winner === -1
      ? 'It’s a draw'
      : mine(live.result.winner)
        ? 'You win'
        : `${name(live.result.winner)} wins`
    : myTurn && !session.local
      ? last?.ok && last.seat === me.seat
        ? 'Go again'
        : 'Your turn'
      : last?.ok && last.seat === live.turn
        ? `${name(live.turn)} goes again`
        : `${name(live.turn)}’s turn`

  const word = selected >= 0 ? puzzle.words[selected] : null
  const step = (dir: 1 | -1) => {
    sound('tap')
    pick(nextOpen(live.owners, selected < 0 ? -1 : selected, dir))
  }

  return (
    <main className="cwm screen-in">
      <div className="mt-hud">
        <ScoreCard p={seats[0]} you={mine(0)} active={session.local && inMatch && live.turn === 0} value={score(0)} meta={`${COLOUR[0]} · words`} />
        <div className={`cw-turn${myTurn ? ' cw-turn--you' : ''}`} aria-live="polite">
          <span className="label">{over ? 'Done' : `${left} left`}</span>
          <span className={`cw-mini cw-mini--${live.result ? (live.result.winner === -1 ? 'draw' : live.result.winner) : live.turn}`} aria-hidden="true" />
        </div>
        <ScoreCard p={seats[1]} you={mine(1)} active={session.local && inMatch && live.turn === 1} value={score(1)} meta={`${COLOUR[1]} · words`} />
      </div>

      <p className={`cw-status${myTurn ? ' cw-status--you' : ''}`} role="status">
        <span className="cw-status__main">{status}</span>
        {event && <span className={`cw-status__event${last?.ok ? '' : last && last.w >= 0 ? ' cw-status__event--miss' : ''}`}>{event}</span>}
      </p>

      <div className="cw-play">
        <div className="cw-stage">
          <Grid puzzle={puzzle} colours={painted} selected={inMatch ? selected : -1} draft={spelled} fresh={fresh} reveal={over} onTap={inMatch ? tapSquare : undefined} />
        </div>

        <div className="cw-side">
          {word && inMatch && (
            <>
              <div className="cw-cluebar">
                <button type="button" className="cw-cluebar__step" onClick={() => step(-1)} aria-label="Previous clue">
                  ‹
                </button>
                <p className="cw-cluebar__text">
                  <b>
                    {word.num} {word.dir === 'A' ? 'across' : 'down'}
                  </b>{' '}
                  {word.clue} <span className="cw-clue__len">({word.word.length})</span>
                </p>
                <button type="button" className="cw-cluebar__step" onClick={() => step(1)} aria-label="Next clue">
                  ›
                </button>
              </div>
              <AnswerTiles known={known} draft={spelled} cursor={cursor} shake={shake} />
              <Keys canType={inMatch} canAct={myTurn && !busy} full={full} onKey={type} onBack={back} onPass={skip} onSubmit={submit} />
            </>
          )}
          <ClueLists puzzle={puzzle} owners={live.owners} selected={selected} onPick={(w) => (sound('tap'), pick(w))} />
        </div>
      </div>

      {awaySecs !== null && opp && (
        <p className="mt-banner" role="status">
          {opp.name} disconnected · ending the match in {awaySecs}s unless they’re back
        </p>
      )}
    </main>
  )
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: CrosswordState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const { puzzle, live } = st
  const s = [count(live.owners, 0), count(live.owners, 1)]
  const winner = (live.result?.winner ?? -1) as Seat | -1
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const unsolved = puzzle.words.length - s[0] - s[1]

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

  // host builds a fresh puzzle once both are ready (same theme, the other player starts)
  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialCrosswordState(st.theme, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.theme, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Crossword',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: `${COLOUR[k]} · words` })) as CardInput['players'],
    detail: {
      kind: 'crossword',
      rows: puzzle.rows,
      cols: puzzle.cols,
      colours: colours(puzzle, live),
      stats: [['Theme', THEME_LABEL[st.theme]], unsolved ? ['Unsolved', String(unsolved)] : ['Words', String(puzzle.words.length)]],
    },
  }

  return (
    <main className="cwm cwm-results screen-in">
      {iWon && <Confetti />}
      <div className="cwm-results__head">
        {winner !== -1 && <VsBlock mood="win" side={winner} eyes size={64} />}
        <p className="label">
          Match {st.match} · {THEME_LABEL[st.theme]}
          {live.result?.reason === 'passed' ? ` · both passed with ${words(unsolved)} left` : ''}
        </p>
        <h1 className={`cwm-results__title${iWon ? ' cwm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${seats[winner]?.name ?? 'They'} wins`}
        </h1>
        <p className="cwm-results__line">
          {s[0]} <span>—</span> {s[1]}
        </p>
      </div>
      <div className="mt-hud cwm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta={`${COLOUR[0]} · words`} />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta={`${COLOUR[1]} · words`} />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Crossword', GAME, names, winner, scoreLine)}
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
