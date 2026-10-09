import { useEffect, useRef, useState } from 'react'
import { useSound } from '../../lib/sound'
import { useBeforeUnload } from '../../lib/useBeforeUnload'
import { loadDictionary } from '../../lib/dictionary'
import type { MatchExit, Me } from '../../lobby/Lobby'
import { playersBySeat, type Room, type Seat } from '../../lobby/rooms'
import { VsBlock } from '../../components/VsBlock'
import { BOT_NAME, BOT_SEAT } from '../../match/bot'
import { Confetti } from '../../match/Confetti'
import { MatchEnded } from '../../match/MatchEnded'
import { ResultActions } from '../../match/ResultActions'
import { ResultMark } from '../../match/ResultMark'
import { RivalryLine } from '../../match/RivalryLine'
import { ScoreCard } from '../../match/ScoreCard'
import { useOpsLevel, useSession, useVsOps } from '../../match/session'
import { shareLink, shareMessage } from '../../match/share'
import type { CardInput } from '../../match/shareCard'
import type { Seated } from '../../match/types'
import { useHold } from '../../match/useHold'
import { useOpponentAway } from '../../match/useOpponentAway'
import { useRivalry } from '../../match/useRivalry'
import { fitting, opsWord } from './bot'
import { Grid, Keys, WordSetter, loadSecret, problem, saveSecret, useTyping, type Secret } from './Board'
import {
  MAX_GUESSES,
  SOLVED,
  answer,
  commitOf,
  cracked,
  forfeit,
  freshLive,
  guess,
  letterStates,
  lock,
  newSalt,
  other,
  reveal,
  revealed,
  score,
  triesOf,
  verify,
  type Live,
} from './engine'
import '../../styles/battleword.css'

const GAME = 'battleword'
/** The last row's flip and the reveal stay up this long before the results. */
const RESULT_MS = 2600

export interface BattlewordState {
  match: number
  live: Live
  ready?: Record<string, boolean>
}

export function initialBattlewordState(match = 1): BattlewordState {
  // who guesses first alternates between matches
  return { match, live: freshLive((match % 2 === 1 ? 0 : 1) as Seat) }
}

export function BattlewordMatch({ room, me, exit }: { room: Room; me: Me; exit: MatchExit }) {
  const st = room.state as unknown as BattlewordState
  const live = st.live
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
  const seats = playersBySeat(room)
  const opp = seats[me.seat === 0 ? 1 : 0]
  const name = (s: Seat) => seats[s]?.name ?? `Player ${s + 1}`
  const mine = (s: Seat) => !session.local && s === me.seat
  const vsOps = useVsOps()
  const level = useOpsLevel()

  // each word lives only on its owner's device (on one device, both; against Ops, hers too)
  const secretId = (s: Seat) => `${room.code}:${room.createdAt}:${st.match}:${s}`
  const [mem, setMem] = useState<Record<string, Secret>>({})
  const owns = (s: Seat) => session.local || s === me.seat || (vsOps && s === BOT_SEAT)
  const secretOf = (s: Seat): Secret | null => (owns(s) ? (mem[secretId(s)] ?? loadSecret(secretId(s))) : null)

  useEffect(() => {
    loadDictionary()
  }, [])

  const over = live.phase === 'done'
  const showResults = useHold(over, RESULT_MS)
  const abandoned = room.status === 'abandoned'
  const inMatch = !abandoned && !over
  useBeforeUnload(inMatch)
  const awaySecs = useOpponentAway(GAME, room.code, opp, inMatch)

  /* ── moves ── */
  const lockWord = async (s: Seat, word: string) => {
    const salt = newSalt()
    const commit = await commitOf(word, salt)
    saveSecret(secretId(s), { word, salt })
    setMem((m) => ({ ...m, [secretId(s)]: { word, salt } }))
    if (!(vsOps && s === BOT_SEAT)) sound('tap')
    session.move<Live>((cur) => lock(cur, s, commit)).catch(() => {})
  }
  const sendGuess = (s: Seat, w: string) => {
    if (session.local) {
      // one device: the colours come straight from the other word in memory
      const theirs = secretOf(other(s))
      session.move<Live>((cur) => {
        const g = guess(cur, s, w)
        return g && theirs ? answer(g, score(w, theirs.word)) : g
      })
    } else {
      session.move<Live>((cur) => guess(cur, s, w)).catch(() => {})
    }
  }

  // answer each guess at a word this device holds (yours online; Ops' too when she's playing)
  const pending = live.pending
  const holder = pending ? other(pending.s) : null
  const held = holder !== null && !session.local ? secretOf(holder) : null
  useEffect(() => {
    if (!pending || !held || session.local) return
    const t = setTimeout(() => session.move<Live>((cur) => (cur.pending ? answer(cur, score(cur.pending.w, held.word)) : undefined)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [pending, held, session])

  // Ops hides her word as soon as the game starts
  const opsPicked = useRef('')
  const opsId = secretId(BOT_SEAT)
  useEffect(() => {
    if (!vsOps || live.phase !== 'setting' || live.commits?.s1 || opsPicked.current === opsId) return
    opsPicked.current = opsId
    const t = setTimeout(() => lockWord(BOT_SEAT, opsWord(level ?? 'medium')), 700)
    return () => {
      clearTimeout(t)
      opsPicked.current = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsOps, live.phase, opsId])

  // the end: each owner shows their word so the other can check it
  useEffect(() => {
    if (!over) return
    for (const s of [0, 1] as Seat[]) {
      const sec = secretOf(s)
      if (sec && !revealed(live, s)) session.move<Live>((cur) => reveal(cur, s, sec.word, sec.salt)).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, live.reveal?.s0, live.reveal?.s1])

  // sounds: a new row of colours, and the end
  const counts = `${triesOf(live, 0).length}:${triesOf(live, 1).length}`
  const seenRef = useRef({ counts, over })
  useEffect(() => {
    const seen = seenRef.current
    if (counts !== seen.counts) {
      const last = [0, 1].map((s) => triesOf(live, s as Seat).at(-1)).find((g, s) => g && triesOf(live, s as Seat).length !== Number(seen.counts.split(':')[s]))
      if (last) sound(last.p === SOLVED ? 'findBig' : last.p.includes('2') ? 'find' : 'tap')
    }
    if (over && !seen.over) {
      const w = live.result?.winner
      sound(w === -1 ? 'end' : session.local || w === me.seat ? 'findBig' : 'end')
    }
    seenRef.current = { counts, over }
  }, [counts, over, live, me.seat, sound, session.local])

  // the guesser waits on the other phone; say so if it's slow
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!pending || session.local) return
    const t = setTimeout(() => setSlow(true), 2500)
    return () => clearTimeout(t)
  }, [pending, session.local])

  // pass & play: the phone changes hands before each word is hidden
  const [handed, setHanded] = useState<string | null>(null)
  const localSetter: Seat | null = live.phase === 'setting' ? (!live.commits?.[`s${live.starter}`] ? live.starter : other(live.starter)) : null
  const coverKey = session.local && localSetter !== null ? `set:${localSetter}` : null
  const cover = session.local && inMatch && coverKey !== null && handed !== coverKey

  // who's guessing now, and typing their guess
  const turn = live.turn
  const guesser: Seat = session.local ? turn : me.seat
  const myTries = triesOf(live, guesser)
  const canGuess = live.phase === 'playing' && !pending && (session.local || turn === me.seat) && myTries.length < MAX_GUESSES
  const [msg, setMsg] = useState('')
  const [shake, setShake] = useState(0)
  const submit = (w: string) => {
    const why = problem(w, false) || (myTries.some((g) => g.w === w) ? 'Already tried that one' : '')
    if (why) {
      setMsg(why)
      setShake((n) => n + 1)
      sound('error')
      return
    }
    setMsg('')
    setWord('')
    sendGuess(guesser, w)
  }
  const { word: typed, setWord, key } = useTyping(canGuess, submit)
  useEffect(() => setWord(''), [turn, setWord])
  // a new letter clears the last complaint
  useEffect(() => setMsg(''), [typed])

  const used = () => `of ${MAX_GUESSES} guesses`
  const round = Math.min(MAX_GUESSES, Math.min(triesOf(live, 0).length, triesOf(live, 1).length) + 1)
  const scoreboard = (
    <>
      <ScoreCard p={seats[0]} you={mine(0)} score={null} value={triesOf(live, 0).length} meta="guesses" />
      <span className="mt-ended__vs" aria-hidden="true">vs</span>
      <ScoreCard p={seats[1]} you={mine(1)} score={null} value={triesOf(live, 1).length} meta="guesses" />
    </>
  )

  if (abandoned && !over) return <MatchEnded room={room} me={me} seats={seats} exit={exit} scoreboard={scoreboard} />
  if (showResults) return <Results room={room} me={me} st={st} seats={seats} exit={exit} />

  const hud = (
    <div className="mt-hud">
      <ScoreCard p={seats[0]} you={mine(0)} active={session.local && live.phase === 'playing' && turn === 0} turn={live.phase === 'playing' && turn === 0} score={null} value={triesOf(live, 0).length} meta={used()} />
      <div className="bw-mid">
        <span className="label">Round</span>
        <strong>
          {round}/{MAX_GUESSES}
        </strong>
      </div>
      <ScoreCard p={seats[1]} you={mine(1)} active={session.local && live.phase === 'playing' && turn === 1} turn={live.phase === 'playing' && turn === 1} score={null} value={triesOf(live, 1).length} meta={used()} />
    </div>
  )
  const away = awaySecs !== null && opp && <p className="mt-banner" role="status">{opp.name} disconnected · ending the match in {awaySecs}s unless they’re back</p>

  if (cover && localSetter !== null) {
    const o = other(localSetter)
    return (
      <main className="bwm screen-in">
        {hud}
        <div className="bw-cover">
          <VsBlock mood="wait" eyes size={72} />
          <p className="label">Pass the phone</p>
          <h1 className="bw-cover__title">{name(localSetter)} hides a word</h1>
          <p>{name(o)}, look away while {name(localSetter)} picks.</p>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setHanded(coverKey)}>
            I’m {name(localSetter)} <span className="keycap">↵</span>
          </button>
        </div>
      </main>
    )
  }

  /* ── setting ── */
  if (live.phase === 'setting') {
    const s: Seat = session.local ? localSetter! : me.seat
    const done = !!live.commits?.[`s${s}`]
    return (
      <main className="bwm screen-in">
        {hud}
        {!done ? (
          <WordSetter key={secretId(s)} hide={session.local} forName={name(other(s))} onLock={(w) => lockWord(s, w)} />
        ) : (
          <div className="bw-cover">
            <VsBlock mood="wait" eyes size={72} />
            <h1 className="bw-cover__title">Word locked in</h1>
            <p>Waiting for {name(other(s))} to hide theirs…</p>
          </div>
        )}
        {away}
      </main>
    )
  }

  /* ── playing / just finished ── */
  const theirSeat = other(guesser)
  const lastChance = live.phase === 'playing' && turn !== live.starter && cracked(triesOf(live, live.starter))
  const lost = !session.local && pending && holder === me.seat && !secretOf(me.seat)
  const status = over
    ? endLine(live, name, session.local ? null : me.seat)
    : session.local
      ? lastChance
        ? `${name(live.starter)} cracked it! ${name(turn)}: last guess to tie`
        : `${name(turn)}’s guess`
      : turn === me.seat
        ? pending
          ? slow
            ? `Waiting for ${name(theirSeat)}’s phone…`
            : 'Checking…'
          : lastChance
            ? `${name(live.starter)} cracked it! Last guess to tie`
            : 'Your guess'
        : lastChance
          ? `You cracked it! ${name(turn)} gets one last guess`
          : `${name(turn)} is guessing`

  // on one device both boards sit in seat order; online yours is on the left
  const order: Seat[] = session.local ? [0, 1] : [me.seat, other(me.seat)]
  const showLetters = (s: Seat) => session.local || vsOps || s === me.seat
  const opsGuessing = vsOps && turn === BOT_SEAT && live.phase === 'playing'

  return (
    <main className="bwm screen-in">
      {hud}
      <p className={`bw-status${canGuess ? ' bw-status--you' : ''}${over ? ' bw-status--result' : ''}`} role="status">
        {status}
      </p>
      <div className="bw-boards">
        {order.map((s) => (
          <div key={s} className={`bw-board bw-board--${s}${live.phase === 'playing' && turn === s ? ' bw-board--turn' : ''}`}>
            <p className="bw-board__label">{!session.local && s === me.seat ? 'Your guesses' : `${name(s)}’s guesses`}</p>
            <Grid
              guesses={triesOf(live, s)}
              typing={s === guesser && canGuess ? typed : undefined}
              pending={pending?.s === s ? pending.w : undefined}
              letters={showLetters(s)}
              shake={s === guesser ? shake : 0}
              small={!session.local && s !== me.seat}
              label={`${name(s)}’s guesses at ${name(other(s))}’s word`}
            />
          </div>
        ))}
      </div>
      {opsGuessing && <OpsWorking live={live} />}
      {lost ? (
        <div className="bw-reveal">
          <p className="bw-warn">Your word isn’t on this device any more (the page was opened somewhere else), so you can’t answer.</p>
          <button type="button" className="btn" onClick={() => session.move<Live>((cur) => forfeit(cur, me.seat)).catch(() => {})}>
            Give {name(theirSeat)} the game
          </button>
        </div>
      ) : (
        !over && (
          <>
            <p className="bw-msg" role="alert">
              {msg}
            </p>
            <Keys
              states={letterStates(myTries)}
              enabled={canGuess}
              onKey={key}
            />
          </>
        )
      )}
      {away}
    </main>
  )
}

/** What Ops is going on while she guesses: how many words she knows still fit her clues. */
function OpsWorking({ live }: { live: Live }) {
  const gs = triesOf(live, BOT_SEAT)
  const n = fitting(gs).length
  return (
    <p className="bw-working" role="status">
      {BOT_NAME}: {gs.length ? `${n.toLocaleString()} word${n === 1 ? '' : 's'} I know still fit` : 'thinking where to start…'}
    </p>
  )
}

function endLine(live: Live, name: (s: Seat) => string, me: Seat | null) {
  const r = live.result
  if (!r) return ''
  if (r.reason === 'forfeit') return `${name(r.winner as Seat)} takes the game`
  if (r.winner === -1) return r.reason === 'out' ? 'Nobody cracked it' : 'Both cracked it: a draw'
  const n = triesOf(live, r.winner).length
  return `${me === r.winner ? 'You' : name(r.winner)} cracked it in ${n}!`
}

/* ── Results ─────────────────────────────────────────────────────────── */

function Results({ room, me, st, seats, exit }: { room: Room; me: Me; st: BattlewordState; seats: [Seated | null, Seated | null]; exit: MatchExit }) {
  const { play: sound } = useSound()
  const session = useSession(GAME, room.code)
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

  // the reveal: does each word match what was locked in, and every colour given?
  const [honest, setHonest] = useState<[boolean | null, boolean | null]>([null, null])
  useEffect(() => {
    let alive = true
    Promise.all([verify(live, 0), verify(live, 1)]).then((v) => alive && setHonest(v as [boolean | null, boolean | null]))
    return () => {
      alive = false
    }
  }, [live])

  const ready = st.ready ?? {}
  const imReady = !!ready[me.id]
  const oppReady = !!(opp && ready[opp.id])
  const oppGone = room.status === 'abandoned' || !opp?.online

  const dealt = useRef(false)
  useEffect(() => {
    if (!me.isHost || dealt.current || !imReady || !oppReady) return
    dealt.current = true
    session.start({ ...initialBattlewordState(st.match + 1) })
  }, [session, me.isHost, imReady, oppReady, st.match])

  const rivalry = useRivalry(GAME, room, me, seats, winner, st.match)
  const n = (s: Seat) => triesOf(live, s).length
  const wordOf = (s: Seat) => revealed(live, s)?.word ?? '?????'
  const scoreLine = `${n(0)} — ${n(1)}`
  const headline = winner === -1 ? undefined : live.result?.reason === 'forfeit' ? 'BY FORFEIT' : `CRACKED IT IN ${n(winner)}`
  const card: CardInput = {
    game: 'Battleword',
    winner,
    scoreLine,
    headline,
    link: shareLink(GAME),
    rivalry: rivalry?.card,
    players: [0, 1].map((k) => ({ name: names[k], seat: k as 0 | 1, score: String(n(k as Seat)), meta: 'guesses' })) as CardInput['players'],
    detail: { kind: 'battleword', grids: [triesOf(live, 0).map((g) => g.p), triesOf(live, 1).map((g) => g.p)], words: [wordOf(0), wordOf(1)] },
  }
  const title = winner === -1 ? 'Draw' : iWon && !session.local ? 'You win' : `${names[winner]} wins`

  return (
    <main className="bwm bwm-results screen-in">
      {iWon && <Confetti />}
      <div className="bwm-results__head">
        <ResultMark winner={winner} />
        <p className="label">Match {st.match} · Battleword</p>
        <h1 className={`bwm-results__title${iWon ? ' bwm-results__title--win' : ''}`}>{title}</h1>
        <p className="hint">{endLine(live, (s) => names[s], session.local ? null : me.seat)}</p>
      </div>
      <div className="bw-boards bw-boards--results">
        {([0, 1] as Seat[]).map((s) => (
          <div key={s} className={`bw-board bw-board--${s}`}>
            <p className="bw-board__label">{names[s]}</p>
            <p className="bw-board__word" aria-label={`cracking ${wordOf(other(s))}`}>
              {wordOf(other(s))}
            </p>
            <Grid guesses={triesOf(live, s)} small label={`${names[s]}’s guesses`} />
            {honest[other(s)] === false && <p className="bw-warn">{names[other(s)]}’s word doesn’t match what was locked in, or a colour was wrong.</p>}
          </div>
        ))}
      </div>
      {honest[0] && honest[1] && !session.local && <p className="hint bw-check">✓ Both words match what was locked in, and every colour was right</p>}
      <RivalryLine r={rivalry} />
      <ResultActions
        card={card}
        message={shareMessage('Battleword', GAME, names, winner, scoreLine)}
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
