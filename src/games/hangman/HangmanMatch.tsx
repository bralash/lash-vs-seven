import { useEffect, useRef, useState } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
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
import { Gallows, Keyboard, WordPicker, WordTiles, loadSecret, saveSecret, type Secret } from './Board'
import {
  MAX_WRONG,
  ROUNDS,
  answer,
  commitOf,
  current,
  forfeit,
  freshLive,
  guess,
  lock,
  matchOver,
  newSalt,
  nextRound,
  roundWinner,
  setterOf,
  verify,
  wins,
  type Live,
  type Round,
} from './engine'
import '../../styles/hangman.css'

const GAME = 'hangman'
/** The final reveal stays up this long before the results. */
const RESULT_MS = 3200

export interface HangmanState {
  hints: boolean
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialHangmanState(hints = false, match = 1): HangmanState {
  // who sets the first word alternates between matches
  return { hints, match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

const other = (s: Seat) => (1 - s) as Seat

export function HangmanMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as HangmanState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !session.local && s === me.seat

  const r = current(live)
  const setter = setterOf(live)
  const guesser = other(setter)
  // online you are one side; on one device you're both, so you set and guess
  const iSet = session.local || me.seat === setter
  const iGuess = session.local || me.seat === guesser

  // the setter's word for this round lives only on their device
  const secretId = `${room.code}:${room.createdAt}:${st.match}:${live.round}`
  const [mem, setMem] = useState<Record<string, Secret>>({})
  const secret = iSet ? (mem[secretId] ?? loadSecret(secretId)) : null

  const over = matchOver(live)
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  /* ── moves ── */
  const lockWord = async (word: string, hint: string) => {
    const salt = newSalt()
    const commit = await commitOf(word, salt)
    saveSecret(secretId, { word, salt })
    setMem((m) => ({ ...m, [secretId]: { word, salt } }))
    sound('tap')
    session.move<Live>((cur) => lock(cur, setter, { length: word.length, commit, hint: st.hints ? hint : '' })).catch(() => {})
  }
  const tryLetter = (l: string) => {
    sound('tap')
    if (session.local) {
      // one device: the answer comes straight from the word in memory
      const s = secret
      session.move<Live>((cur) => {
        const g = guess(cur, guesser, l)
        return g && s ? answer(g, s.word, s.salt) : g
      })
    } else {
      session.move<Live>((cur) => guess(cur, me.seat, l)).catch(() => {})
    }
  }

  // online setter: answer each guess as it arrives
  const pending = r?.pending
  useEffect(() => {
    if (session.local || me.seat !== setter || !pending || !secret) return
    session.move<Live>((cur) => answer(cur, secret.word, secret.salt)).catch(() => {})
  }, [pending, secret, setter, me.seat, session])

  // the guesser waits on the setter's phone; say so if it's slow
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!pending || session.local) return
    const t = setTimeout(() => setSlow(true), 2500)
    return () => clearTimeout(t)
  }, [pending, session.local])

  // sounds for each answer, and the end of a round
  const seenRef = useRef({ guessed: r?.guessed ?? '', outcome: r?.outcome })
  useEffect(() => {
    const seen = seenRef.current
    const g = r?.guessed ?? ''
    if (r && g.length > seen.guessed.length) {
      const l = g[g.length - 1]
      sound(r.masked.includes(l) ? 'find' : 'error')
    }
    if (r?.outcome && !seen.outcome) {
      const guesserWon = r.outcome !== 'hanged'
      const iWon = session.local ? true : (guesserWon ? guesser : setter) === me.seat
      sound(iWon ? 'findBig' : 'end')
    }
    seenRef.current = { guessed: g, outcome: r?.outcome }
  }, [r, guesser, setter, me.seat, sound, session.local])

  // the reveal: does the word match what was locked in, and every answer given?
  const [honest, setHonest] = useState<boolean | null>(null)
  useEffect(() => {
    setHonest(null)
    if (!r?.outcome) return
    let alive = true
    verify(r).then((ok) => alive && setHonest(ok))
    return () => {
      alive = false
    }
  }, [r])

  // pass & play: the phone changes hands before each secret part
  const [handed, setHanded] = useState<string | null>(null)
  const coverKey = live.phase === 'setting' ? `set:${live.round}` : live.phase === 'guessing' ? `guess:${live.round}` : null
  const cover = session.local && inMatch && coverKey !== null && handed !== coverKey

  const w = wins(live)
  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} value={w[0]} meta="rounds won" />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} value={w[1]} meta="rounds won" />
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const role = (s: Seat) => (s === setter ? 'setting' : 'guessing')
  const hud = (
    <div className="mt-hud">
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && inMatch && live.turn === 0} value={w[0]} meta={role(0)} />
      <div className="hm-round">
        <span className="label">Round</span>
        <strong>
          {live.round + 1}/{ROUNDS}
        </strong>
      </div>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && inMatch && live.turn === 1} value={w[1]} meta={role(1)} />
    </div>
  )

  if (cover) {
    const who = live.phase === 'setting' ? setter : guesser
    return (
      <main className="hmm screen-in">
        {hud}
        <div className="hm-cover">
          <VsBlock mood="wait" eyes size={72} />
          <p className="label">Pass the phone</p>
          <h1 className="hm-cover__title">{name(who)}’s turn</h1>
          <p>{live.phase === 'setting' ? `${name(guesser)}, look away while ${name(setter)} picks a word.` : `${name(setter)}’s word is locked in. Hand over to ${name(guesser)}.`}</p>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setHanded(coverKey)}>
            I’m {name(who)} <span className="keycap">↵</span>
          </button>
        </div>
      </main>
    )
  }

  /* ── setting ── */
  if (live.phase === 'setting') {
    return (
      <main className="hmm screen-in">
        {hud}
        {iSet ? (
          <WordPicker key={secretId} hints={st.hints} hide={session.local} guesserName={name(guesser)} onLock={lockWord} />
        ) : (
          <div className="hm-cover">
            <VsBlock mood="wait" eyes size={72} />
            <h1 className="hm-cover__title">{name(setter)} is picking a word…</h1>
            <p>You’ll see how long it is, then start guessing.</p>
          </div>
        )}
        {awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>}
      </main>
    )
  }

  /* ── guessing / round over ── */
  const round = r!
  const done = live.phase === 'done'
  const canGuess = iGuess && !done && !round.pending && (!session.local || !!secret)
  const lost = !session.local && me.seat === setter && !done && !secret
  const status = done
    ? outcomeLine(round, name)
    : session.local
      ? `${name(guesser)}’s guess`
      : iGuess
        ? round.pending
          ? slow
            ? `Waiting for ${name(setter)}’s phone…`
            : 'Checking…'
          : 'Your guess'
        : `${name(guesser)} is guessing`

  return (
    <main className="hmm screen-in">
      {hud}
      <p className={`hm-status${canGuess ? ' hm-status--you' : ''}${done ? ' hm-status--result' : ''}`} role="status">
        {status}
      </p>

      <div className="hm-stage">
        <Gallows key={live.round} wrong={round.wrong} outcome={round.outcome} />
        <div className="hm-stage__word">
          {/* the setter sees their own word faintly; everyone sees it at the end */}
          <WordTiles masked={round.masked} word={round.word ?? (session.local ? undefined : secret?.word)} lastLetter={(round.guessed ?? '').slice(-1)} />
          {round.hint && <p className="hm-hint">Hint · {round.hint}</p>}
          <p className="hm-lives">
            {MAX_WRONG - round.wrong} wrong guess{MAX_WRONG - round.wrong === 1 ? '' : 'es'} left
          </p>
        </div>
      </div>

      {done ? (
        <div className="hm-reveal">
          {honest === false && <p className="hm-warn">This word doesn’t match the one locked in at the start.</p>}
          {honest === true && round.word && <p className="hint">✓ Same word that was locked in</p>}
          {!over && (
            <button type="button" className="btn btn--primary btn--lg" onClick={() => session.move<Live>((cur) => nextRound(cur)).catch(() => {})}>
              {!session.local && me.seat === guesser ? 'Pick my word' : 'Next round'} <span className="keycap">↵</span>
            </button>
          )}
        </div>
      ) : lost ? (
        <div className="hm-reveal">
          <p className="hm-warn">Your word isn’t on this device any more (the page was opened somewhere else), so you can’t answer.</p>
          <button type="button" className="btn" onClick={() => session.move<Live>((cur) => forfeit(cur, me.seat)).catch(() => {})}>
            Give {name(guesser)} the round
          </button>
        </div>
      ) : (
        <Keyboard
          guessed={round.guessed ?? ''}
          word={session.local ? undefined : (secret?.word ?? undefined)}
          masked={round.masked}
          pending={round.pending}
          enabled={canGuess}
          onKey={tryLetter}
        />
      )}

      {awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>}
    </main>
  )
}

function outcomeLine(r: Round, name: (s: Seat) => string) {
  const g = other(r.setter)
  if (r.outcome === 'escaped') return `${name(g)} escaped!`
  if (r.outcome === 'hanged') return `Hanged — ${name(r.setter)} takes it`
  return `${name(g)} takes the round`
}

const roundNote = (r: Round) => (r.outcome === 'escaped' ? `escaped · ${r.wrong} wrong` : r.outcome === 'hanged' ? 'hanged' : 'forfeit')

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: HangmanState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const live = st.live
  const s = wins(live)
  const winner = (s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1) as Seat | -1
  const iWon = session.local ? winner !== -1 : winner === me.seat
  const opp = seats[me.seat === 0 ? 1 : 0]
  const rounds = live.rounds ?? []

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
  const over = room.status === 'abandoned'
  const oppGone = over || !opp?.online

  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialHangmanState(st.hints, st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.hints, st.match])

  const names: [string, string] = [seats[0]?.name ?? 'Player 1', seats[1]?.name ?? 'Player 2']
  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const scoreLine = `${s[0]} — ${s[1]}`
  const card: CardInput = {
    game: 'Hangman',
    winner,
    scoreLine,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(s[k]), meta: 'rounds won' })) as CardInput['players'],
    detail: { kind: 'rounds', rows: rounds.map((r) => ({ word: r.word ?? '?'.repeat(r.length), seat: roundWinner(r), note: roundNote(r) })) },
  }

  return (
    <main className="hmm hmm-results screen-in">
      {iWon && <Confetti />}
      <div className="hmm-results__head">
        {winner !== -1 && <VsBlock mood="win" side={winner} eyes size={64} />}
        <p className="label">Match {st.match} · Hangman</p>
        <h1 className={`hmm-results__title${iWon ? ' hmm-results__title--win' : ''}`}>
          {winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`}
        </h1>
      </div>
      <ol className="hm-rounds">
        {rounds.map((r, i) => {
          const wnr = roundWinner(r)
          return (
            <li key={i} className={`hm-rounds__row${wnr !== null ? ` hm-rounds__row--${wnr}` : ''}`}>
              <span className="hm-rounds__who">
                {names[r.setter]} set
              </span>
              <strong>{r.word ?? '—'}</strong>
              <span className="hm-rounds__note">{roundNote(r)}</span>
            </li>
          )
        })}
      </ol>
      <div className="mt-hud hmm-results__cards">
        <ScoreCard p={seats[0]} you={!session.local && me.seat === 0} value={s[0]} meta="rounds won" />
        <span className="mt-ended__vs" aria-hidden="true">vs</span>
        <ScoreCard p={seats[1]} you={!session.local && me.seat === 1} value={s[1]} meta="rounds won" />
      </div>
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Hangman', GAME, names, winner, scoreLine)}
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
