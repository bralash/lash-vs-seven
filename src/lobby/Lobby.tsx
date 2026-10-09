import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { VsBlock } from '../components/VsBlock'
import { HowToPlay, type RulesDemo } from '../components/HowToPlay'
import { ArrowLeft, Copy, Exit, Maximize, Minimize } from '../components/Icons'
import { TopBar } from '../components/TopBar'
import type { GameMeta } from '../games/registry'
import { useSound } from '../lib/sound'
import { useFullscreen } from '../lib/useFullscreen'
import { playerId, signIn } from '../lib/firebase'
import { KEYS, hasLeft, load, markLeft, save } from '../lib/storage'
import {
  CODE_LENGTH,
  createRoom,
  inviteUrl,
  joinRoom,
  leaveRoom,
  abandonRoom,
  normalizeCode,
  peekRoom,
  seatedPlayers,
  startMatch,
  stakeAgreed,
  stillIn,
  takeOverHost,
  trackPresence,
  type AnySeat,
  type JoinFailure,
  type Room,
} from './rooms'
import { ConfirmLeave, type LeaveKind } from './ConfirmLeave'
import { LocalGame, LocalSetup, loadLocal, saveLocal, type LocalMatch } from './LocalGame'
import { OpsReactions } from '../match/OpsReactions'
import { Reactions } from '../match/Reactions'
import { SelfOffline } from '../match/SelfOffline'
import { BOT_NAME, type Brain, type OpsSense } from '../match/bot'
import { OpsFace } from '../components/OpsFace'
import { StakePanel } from './StakePanel'
import { LooksProvider, looksFor } from '../match/looks'
import { ThrowLayer, throwsIn } from '../match/Throws'
import { VoiceNotes, voiceIn } from '../match/Voice'
import { useRoom } from './useRoom'
import '../styles/lobby.css'

export interface MatchOption {
  label: string
  choices: { value: string; label: string }[]
  initial: string
}

/** One or more host settings, normalised to a list. */
export const optionList = (o?: MatchOption | MatchOption[]) => (Array.isArray(o) ? o : o ? [o] : [])

/** The host's settings as segmented buttons — used in the waiting room and the pass & play setup. */
export function OptionPicker({ options, choices, onChange }: { options: MatchOption[]; choices: string[]; onChange: (next: string[]) => void }) {
  return (
    <>
      {options.map((o, i) => (
        <div key={o.label} className="lobby-option">
          <span className="label">{o.label}</span>
          <div className="seg" role="group" aria-label={o.label}>
            {o.choices.map((c) => (
              <button
                key={c.value}
                type="button"
                className="seg__btn"
                aria-pressed={choices[i] === c.value}
                onClick={() => onChange(choices.map((v, j) => (j === i ? c.value : v)))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export interface MatchExit {
  /** asks "Leave the match?" first — use while the match is live */
  request: () => void
  /** leaves straight away — for screens where the match is already over */
  now: () => void
}

export interface Me {
  id: string
  /** your seat in a two-player game */
  seat: 0 | 1
  /** your seat in a game for up to four (the same as `seat` in two-player games) */
  seatN: AnySeat
  isHost: boolean
}

interface Props {
  game: GameMeta
  /** Rendered once the host starts the match. */
  renderGame: (room: Room, me: Me, exit: MatchExit) => ReactNode
  /** Initial game state written when the host presses Start. `seats`: the seats taken, in order (games for more than two need it) */
  initialState?: (choice?: string, all?: string[], seats?: number[]) => Record<string, unknown>
  /** settings the host picks in the waiting room (e.g. best of 3/5/7), passed to initialState: the first as `choice`, every one in `all` */
  option?: MatchOption | MatchOption[]
  /** lets you play Ops, the computer, on this device */
  bot?: Brain
  /** how Ops reads the match, so she can send reactions during it */
  sense?: OpsSense
  /** a walk-through shown above the rules in How to play */
  rulesDemo?: RulesDemo
}

const FAILURE_COPY: Record<JoinFailure, string> = {
  missing: 'That room doesn’t exist or has closed.',
  started: 'That match has already started.',
  full: 'That room is full.',
  ended: 'That match has ended — a player left.',
  youLeft: 'You left this match, so it’s over for both of you.',
  youDropped: 'You lost connection, and the match ended while you were away.',
  oppLeft: 'Your opponent left, so the match is over.',
  oppDropped: 'Your opponent lost connection and didn’t make it back, so the match is over.',
  offline: 'Couldn’t reach the server. Check your connection and try again.',
}

type Invite =
  | { state: 'checking' }
  | { state: 'ok'; hostName: string; rejoin: boolean }
  | { state: 'bad'; error: JoinFailure }

/** Set while leaving would cost someone something (a live match, or a guest waiting on the host). */
interface LeaveGuard {
  kind: LeaveKind
  other: string | null
  /** two or more others are still in, so the match goes on without you */
  carryOn?: boolean
  /** the stake, while a staked match is being played */
  stake?: string
  /** everyone else in the room by id, so a reaction says whose it is */
  names?: Record<string, string>
  /** identifies the match, so the back-buffer below is pushed once per match */
  key: string
  /** what confirming does: end the online match, or drop the pass-and-play game */
  leave: () => void
}

export function Lobby({ game, renderGame, initialState, option, bot, sense, rulesDemo }: Props) {
  const [params, setParams] = useSearchParams()
  const urlCode = normalizeCode(params.get('room') ?? '')
  const [inRoom, setInRoom] = useState<string | null>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [guard, setGuard] = useState<LeaveGuard | null>(null)
  const [asking, setAsking] = useState(false)
  const leaving = useRef(false)
  const bufferedFor = useRef<string | null>(null)

  // Pass-and-play: games that support it can also be played by two people on this device.
  const canLocal = game.modes !== 'online'
  // a rival's Challenge opens a room even if a pass & play match is saved here (it stays saved for next time)
  const challenging = !!(useLocation().state as { challenge?: string } | null)?.challenge
  const [local, setLocal] = useState<LocalMatch | null>(() => (canLocal && !challenging ? loadLocal(game.slug) : null))
  // which one-device setup is open: two people, or you against Ops
  const [setup, setSetup] = useState<false | 'local' | 'bot'>(false)
  const endLocal = useCallback(() => {
    saveLocal(game.slug, null)
    setLocal(null)
    setSetup(false)
  }, [game.slug])
  // against Ops, the live state also feeds her reactions in the top bar
  const [opsState, setOpsState] = useState<Record<string, unknown> | null>(null)
  const keepLocal = useCallback(
    (m: LocalMatch) => {
      saveLocal(game.slug, m)
      setOpsState(m.bot ? m.state : null)
    },
    [game.slug],
  )
  useEffect(() => {
    if (local) setGuard({ kind: 'local', other: null, key: 'local', leave: endLocal })
    else setGuard((g) => (g?.kind === 'local' ? null : g))
  }, [local, endLocal])

  // Rooms need a player id, which comes from a silent anonymous sign-in (instant on return visits).
  const [auth, setAuth] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [authTry, setAuthTry] = useState(0)
  useEffect(() => {
    let alive = true
    setAuth('pending')
    signIn().then(
      () => alive && setAuth('ready'),
      () => alive && setAuth('failed'),
    )
    return () => {
      alive = false
    }
  }, [authTry])

  const navigate = useNavigate()
  const location = useLocation()

  // Any navigation away while guarded goes through the confirm: links, the logo, and every
  // back/forward press (POP) — including one onto the same-URL buffer entry pushed below.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation, historyAction }) =>
      !!guard &&
      !leaving.current &&
      (historyAction === 'POP' ||
        currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  )
  useEffect(() => {
    if (guard) return
    leaving.current = false
    bufferedFor.current = null // a later rejoin gets a fresh back-buffer
    if (blocker.state === 'blocked') blocker.proceed() // nothing left to protect
  }, [guard, blocker])

  // Players who arrive by invite link have no in-app page behind them, so their first Back
  // would leave the site before the app could ask. Push one same-URL entry when a match starts
  // so that first Back is an in-app navigation the blocker can catch.
  const inMatchCode = guard?.kind === 'match' || guard?.kind === 'local' ? guard.key : null
  useEffect(() => {
    if (!inMatchCode || bufferedFor.current === inMatchCode) return
    bufferedFor.current = inMatchCode
    navigate({ pathname: location.pathname, search: location.search }, { state: { matchBuffer: inMatchCode } })
  }, [inMatchCode, navigate, location.pathname, location.search])

  // Validate an invite link up front — before asking for a name.
  useEffect(() => {
    if (auth !== 'ready' || !urlCode || inRoom === urlCode) return
    let alive = true
    setInvite({ state: 'checking' })
    peekRoom(game.slug, urlCode).then((res) => {
      if (!alive) return
      if ('error' in res) return setInvite({ state: 'bad', error: res.error })
      const me = res.room.players?.[playerId()]
      // Already seated (e.g. page refresh) — go straight back in, unless they chose to leave.
      if (me && !hasLeft(game.slug, urlCode)) return setInRoom(urlCode)
      const host = Object.values(res.room.players ?? {}).find((p) => p.seat === 0)
      setInvite({ state: 'ok', hostName: host?.name ?? 'Someone', rejoin: !!me })
    })
    return () => {
      alive = false
    }
  }, [game.slug, urlCode, inRoom, auth])

  const enterRoom = (code: string) => {
    markLeft(game.slug, null)
    setInRoom(code)
    setInvite(null)
    setParams({ room: code }, { replace: true })
  }
  const exitRoom = () => {
    setInRoom(null)
    setInvite(null)
    setChallengeFor(null)
    setParams({}, { replace: true })
  }

  // "Challenge" from the homepage's rivals: open a room right away (with the saved name) and say who
  // it's for. Without a saved name, the start screen asks as usual.
  const challenge = (location.state as { challenge?: string } | null)?.challenge ?? null
  const [challengeFor, setChallengeFor] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const challenged = useRef(false)
  useEffect(() => {
    if (!challenge || challenged.current || auth !== 'ready' || inRoom || urlCode || local) return
    const name = load(KEYS.name)?.trim()
    if (!name) return
    challenged.current = true
    setOpening(true)
    createRoom(game.slug, name, game.players?.[1]).then(
      (code) => {
        setOpening(false)
        setChallengeFor(challenge)
        enterRoom(code)
      },
      () => setOpening(false),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge, auth, inRoom, urlCode, local, game.slug])

  const confirming = asking || blocker.state === 'blocked'
  const stay = () => {
    setAsking(false)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const confirmLeave = () => {
    if (!guard) return
    leaving.current = true
    setAsking(false)
    guard.leave()
    // Heading somewhere else (link, logo): let that navigation through.
    // Leave button, or Back onto our same-URL buffer: stay on this game and drop the room from the URL.
    if (blocker.state === 'blocked' && blocker.location.pathname !== location.pathname) {
      blocker.proceed()
      return
    }
    if (blocker.state === 'blocked') blocker.reset()
    exitRoom()
  }

  const rulesBtn = game.rules ? (
    <button type="button" className="icon-btn" onClick={() => setShowRules(true)} aria-label="How to play">
      <span aria-hidden="true">?</span>
      <span className="hide-sm" aria-hidden="true">How to play</span>
    </button>
  ) : null

  const inMatch = guard?.kind === 'match' || guard?.kind === 'local'
  const fullscreen = useFullscreen(inMatch && !!game.fullscreen)

  let screen: ReactNode
  if (local) {
    screen = (
      <LocalGame
        game={game}
        match={local}
        onChange={keepLocal}
        exit={{ request: () => setAsking(true), now: endLocal }}
        renderGame={renderGame}
        brain={local.bot ? bot : undefined}
      />
    )
  } else if (setup) {
    screen = (
      <LocalSetup
        game={game}
        option={option}
        initialState={initialState}
        vsBot={setup === 'bot'}
        onStart={(m) => {
          saveLocal(game.slug, m)
          setLocal(m)
        }}
        onBack={() => setSetup(false)}
      />
    )
  } else if (auth !== 'ready') {
    screen =
      auth === 'failed' ? (
        <main className="lobby__main screen-in">
          <div className="lobby__hero">
            <h1 className="lobby__title">Can’t connect</h1>
            <p>{FAILURE_COPY.offline}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setAuthTry((n) => n + 1)}>
            Try again
          </button>
        </main>
      ) : (
        <main className="lobby__main" aria-busy="true">
          <p className="hint">Connecting…</p>
        </main>
      )
  } else if (opening && !inRoom) {
    screen = (
      <main className="lobby__main" aria-busy="true">
        <p className="hint">Opening a room for {challenge}…</p>
      </main>
    )
  } else if (inRoom) {
    screen = (
      <WaitingRoom
        game={game}
        code={inRoom}
        onExit={exitRoom}
        onGuard={setGuard}
        onRequestLeave={() => setAsking(true)}
        renderGame={renderGame}
        initialState={initialState}
        option={option}
        challengeFor={challengeFor}
      />
    )
  } else if (urlCode && invite) {
    screen = <InviteScreen game={game} code={urlCode} invite={invite} onJoined={enterRoom} onDismiss={exitRoom} />
  } else {
    screen = (
      <StartScreen
        game={game}
        onEnter={enterRoom}
        onLocal={canLocal ? () => setSetup('local') : undefined}
        onBot={canLocal && bot ? () => setSetup('bot') : undefined}
      />
    )
  }

  return (
    <div className="page lobby">
      <TopBar
        left={
          inMatch ? (
            // mid-match the only way out is the Leave button, so there's no back arrow to mis-tap
            <span className="topbar__title">
              {game.name}
              <span className="hide-sm">{local ? (local.bot ? ` · vs ${BOT_NAME}` : ' · Pass & play') : ` · Room ${inRoom}`}</span>
            </span>
          ) : (
            <>
              <Link to="/" className="icon-btn" aria-label="All games">
                <ArrowLeft />
              </Link>
              <span className="topbar__title">{game.name}</span>
            </>
          )
        }
        right={
          <>
            {guard?.kind === 'match' && inRoom && voiceIn(game.slug) && <VoiceNotes game={game.slug} code={inRoom} pid={playerId()} names={guard.names} />}
            {guard?.kind === 'match' && inRoom && <Reactions game={game.slug} code={inRoom} pid={playerId()} other={guard.other} names={guard.names} />}
            {local?.bot && sense && opsState && <OpsReactions key={local.startedAt} sense={sense} state={opsState} level={local.bot} />}
            {local && !local.bot && throwsIn(game.slug) && <ThrowLayer me={null} />}
            {inMatch && game.fullscreen && fullscreen.supported && (
              <button type="button" className="icon-btn" onClick={fullscreen.toggle} aria-label={fullscreen.on ? 'Exit full screen' : 'Full screen'} aria-pressed={fullscreen.on}>
                {fullscreen.on ? <Minimize /> : <Maximize />}
              </button>
            )}
            {rulesBtn}
          </>
        }
        end={
          inMatch && (
            <button type="button" className="icon-btn icon-btn--leave" onClick={() => setAsking(true)} aria-label="Leave">
              <Exit /> <span className="hide-sm" aria-hidden="true">Leave</span>
            </button>
          )
        }
      />
      {screen}
      {showRules && game.rules && <HowToPlay rules={game.rules} demo={rulesDemo} onClose={() => setShowRules(false)} />}
      {confirming && guard && <ConfirmLeave kind={guard.kind} other={guard.other} carryOn={guard.carryOn} stake={guard.stake} onStay={stay} onLeave={confirmLeave} />}
    </div>
  )
}

/* ── Name field shared by start + invite screens ────────────────────────── */

function useSavedName() {
  const [name, setName] = useState(() => load(KEYS.name) ?? '')
  const commit = () => {
    const clean = name.trim().slice(0, 16)
    if (clean) save(KEYS.name, clean)
    return clean
  }
  return { name, setName, commit }
}

function NameField({
  value,
  onChange,
  autoFocus,
  placeholder = "Player 1",
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="field-card">
      <label className="label" htmlFor={id}>Your name</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={16}
        autoComplete="nickname"
        autoFocus={autoFocus}
        spellCheck={false}
      />
    </div>
  )
}

/* ── Start: create a room or join with a code ───────────────────────────── */

function StartScreen({ game, onEnter, onLocal, onBot }: { game: GameMeta; onEnter: (code: string) => void; onLocal?: () => void; onBot?: () => void }) {
  const { name, setName, commit } = useSavedName()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')
  const { play } = useSound()

  const fail = (msg: string) => {
    setError(msg)
    setBusy(null)
    play('error')
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    const n = commit()
    if (!n) return fail('Add your name first.')
    setBusy('create')
    setError('')
    try {
      const c = await createRoom(game.slug, n, game.players?.[1])
      play('join')
      onEnter(c)
    } catch {
      fail('Couldn’t create a room. Check your connection and try again.')
    }
  }

  const onJoin = async (e: FormEvent) => {
    e.preventDefault()
    const n = commit()
    if (!n) return fail('Add your name first.')
    if (code.length !== CODE_LENGTH) return fail(`Room codes are ${CODE_LENGTH} letters.`)
    setBusy('join')
    setError('')
    const res = await joinRoom(game.slug, code, n)
    if (!res.ok) return fail(FAILURE_COPY[res.error])
    play('join')
    onEnter(code)
  }

  return (
    <main className="lobby__main screen-in">
      <div className="lobby__hero">
        <h1 className="lobby__title">{game.name}</h1>
        {game.tagline && <p className="hint">{game.tagline}</p>}
      </div>

      <form className="lobby__stack" onSubmit={onCreate}>
        <NameField value={name} onChange={setName} autoFocus={!name} />
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy !== null}>
          {busy === 'create' ? 'Creating…' : 'Create room'} <span className="keycap">↵</span>
        </button>
      </form>

      <div className="divider" role="separator"><span>or join a friend</span></div>

      <form className="join-row" onSubmit={onJoin}>
        <label className="code-field">
          <span className="label">Room code</span>
          <input
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABCD"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="code-hint"
          />
        </label>
        <button type="submit" className="btn" disabled={busy !== null}>
          {busy === 'join' ? 'Joining…' : 'Join'}
        </button>
        <span id="code-hint" className="visually-hidden">{CODE_LENGTH} letters</span>
      </form>

      <p className="lobby__error error-text" role="alert">{error}</p>

      {onLocal && (
        <>
          <div className="divider" role="separator"><span>or on one device</span></div>
          <div className={onBot ? 'lobby__solo' : undefined}>
            <button type="button" className="btn btn--block lobby__local" onClick={onLocal}>
              Pass &amp; play
            </button>
            {onBot && (
              <button type="button" className="btn btn--block lobby__local lobby__ops" onClick={onBot}>
                <OpsFace size={28} /> Play {BOT_NAME}
              </button>
            )}
          </div>
        </>
      )}
    </main>
  )
}

/* ── Invite link: "You've been challenged" ──────────────────────────────── */

function InviteScreen({
  game,
  code,
  invite,
  onJoined,
  onDismiss,
}: {
  game: GameMeta
  code: string
  invite: Invite
  onJoined: (code: string) => void
  onDismiss: () => void
}) {
  const { name, setName, commit } = useSavedName()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<JoinFailure | 'name' | null>(null)
  const { play } = useSound()

  const onJoin = async (e: FormEvent) => {
    e.preventDefault()
    const n = commit()
    if (!n) {
      setError('name')
      play('error')
      return
    }
    setBusy(true)
    const res = await joinRoom(game.slug, code, n)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      play('error')
      return
    }
    play('join')
    onJoined(code)
  }

  if (invite.state === 'checking') {
    return (
      <main className="lobby__main screen-in" aria-busy="true">
        <p className="hint">Checking room {code}…</p>
      </main>
    )
  }

  const failure = invite.state === 'bad' ? invite.error : error && error !== 'name' ? error : null
  if (failure) {
    // They were in this match — "Can't join" would read like someone shut them out.
    const theirOwn = ['youLeft', 'youDropped', 'oppLeft', 'oppDropped'].includes(failure)
    return (
      <main className="lobby__main screen-in">
        <div className="lobby__hero">
          {theirOwn && <p className="label">Room {code}</p>}
          <h1 className="lobby__title">{theirOwn ? 'Match over' : 'Can’t join'}</h1>
          <p>{FAILURE_COPY[failure]}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onDismiss}>
          {theirOwn ? 'Start a new room' : 'Start your own room'}
        </button>
      </main>
    )
  }

  // ok — show the challenge
  return (
    <main className="lobby__main screen-in">
      <div className="lobby__hero">
        {invite.state === 'ok' && invite.rejoin ? (
          <>
            <p className="hint">You left room {code}</p>
            <h1 className="lobby__title">Rejoin the match?</h1>
          </>
        ) : (
          <>
            <p className="hint">{invite.state === 'ok' && `${invite.hostName} challenged you to ${game.name}`}</p>
            <h1 className="lobby__title">You’ve been challenged</h1>
          </>
        )}
      </div>
      <form className="lobby__stack" onSubmit={onJoin}>
        <NameField value={name} onChange={setName} autoFocus placeholder="Player 2" />
        <p className="hint lobby__center">Joining room {code}</p>
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
          {busy ? 'Joining…' : invite.state === 'ok' && invite.rejoin ? 'Rejoin match' : 'Join match'} <span className="keycap">↵</span>
        </button>
      </form>
      <p className="lobby__error error-text" role="alert">{error === 'name' ? 'Add your name first.' : ''}</p>
    </main>
  )
}

/* ── Waiting room ───────────────────────────────────────────────────────── */

function WaitingRoom({
  game,
  code,
  onExit,
  onGuard,
  onRequestLeave,
  renderGame,
  initialState,
  option,
  challengeFor,
}: {
  game: GameMeta
  code: string
  onExit: () => void
  onGuard: (g: LeaveGuard | null) => void
  onRequestLeave: () => void
  renderGame: Props['renderGame']
  initialState?: Props['initialState']
  option?: Props['option']
  /** the rival this room was opened for from the homepage */
  challengeFor?: string | null
}) {
  const live = useRoom(game.slug, code)
  const [toast, setToast] = useState('')
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const options = optionList(option)
  const [choices, setChoices] = useState(() => options.map((o) => o.initial))
  const { play } = useSound()
  const pid = playerId()

  useEffect(() => trackPresence(game.slug, code), [game.slug, code])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  // chime whenever someone arrives
  const count = live.status === 'ready' ? Object.keys(live.room.players ?? {}).length : 0
  const lastCount = useRef(count)
  useEffect(() => {
    if (count >= 2 && count > lastCount.current) play('join')
    lastCount.current = count
  }, [count, play])

  // Tell the lobby when leaving needs a confirmation: during a match, or when a host has a guest waiting.
  const snapshot = live.status === 'ready' ? live.room : null
  useEffect(() => {
    const mine = snapshot?.players?.[pid]
    if (!snapshot || !mine || snapshot.out?.[pid]) return onGuard(null)
    const others = Object.entries(snapshot.players).filter(([id]) => id !== pid)
    const names = Object.fromEntries(others.map(([id, p]) => [id, p.name]))
    const inWith = stillIn(snapshot).filter((p) => p.id !== pid)
    const other = (snapshot.status === 'waiting' ? others.map(([, p]) => p) : inWith).map((p) => p.name).join(' & ') || null
    const leave = () => {
      leaveRoom(game.slug, snapshot)
      markLeft(game.slug, snapshot.code)
    }
    if (snapshot.status === 'abandoned') onGuard(null) // match already over — nothing to protect
    else if (snapshot.status !== 'waiting') onGuard({ kind: 'match', other, carryOn: inWith.length >= 2, stake: snapshot.status === 'playing' && snapshot.stakeDone !== snapshot.startedAt ? snapshot.stake?.text : undefined, names, key: snapshot.code, leave })
    else if (snapshot.hostId === pid && other) onGuard({ kind: 'close', other, key: snapshot.code, leave })
    else onGuard(null)
  }, [snapshot, pid, onGuard, game.slug])
  useEffect(() => () => onGuard(null), [onGuard])

  // A match that carried on without someone: if the host is out, the first player still in takes
  // over; and if two people went at once and only one is left, it's over after all.
  const playing = snapshot?.status === 'playing' ? snapshot : null
  const left = playing ? stillIn(playing) : []
  const hostOut = !!playing?.out?.[playing.hostId]
  const nextHost = hostOut ? left[0]?.id : undefined
  useEffect(() => {
    if (nextHost === pid) takeOverHost(game.slug, code).catch(() => {})
  }, [nextHost, pid, game.slug, code])
  const lastOne = !!playing?.out && left.length < 2 && left[0]?.id === pid
  const outIds = Object.keys(playing?.out ?? {}).join(',')
  useEffect(() => {
    if (!lastOne || !playing?.out) return
    const [who, why] = Object.entries(playing.out).pop()!
    abandonRoom(game.slug, code, who, why === 'left' ? 'left' : 'disconnected').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOne, outIds, game.slug, code])

  if (live.status === 'loading') {
    return <main className="lobby__main" aria-busy="true"><p className="hint">Opening room {code}…</p></main>
  }
  if (live.status !== 'ready' || !live.room.players?.[pid]) {
    return (
      <main className="lobby__main screen-in">
        <div className="lobby__hero">
          <h1 className="lobby__title">Room closed</h1>
          <p>{live.status === 'error' ? FAILURE_COPY.offline : 'The host left, so this room is gone.'}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onExit}>Back to lobby</button>
      </main>
    )
  }

  const room = live.room
  const me = room.players[pid]
  const isHost = room.hostId === pid
  const leave = () => {
    leaveRoom(game.slug, room)
    onExit()
  }

  // the match went on without me (I left, or dropped and didn't make it back in time)
  if (room.status === 'playing' && room.out?.[pid]) {
    const dropped = room.out[pid] === 'dropped'
    return (
      <main className="lobby__main screen-in">
        <div className="lobby__hero">
          <VsBlock mood="left" eyes size={64} />
          <p className="label">Room {code}</p>
          <h1 className="lobby__title">{dropped ? 'You dropped out' : 'You left'}</h1>
          <p>{dropped ? 'You lost connection, so the match carried on without you.' : 'The match is carrying on without you.'}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={leave}>
          Back to lobby
        </button>
      </main>
    )
  }

  if (room.status !== 'waiting') {
    return (
      <>
        <LooksProvider value={looksFor(room)}>
          {renderGame(room, { id: pid, seat: (me.seat < 2 ? me.seat : 0) as 0 | 1, seatN: me.seat, isHost }, { request: onRequestLeave, now: leave })}
        </LooksProvider>
        {room.status === 'playing' && <SelfOffline />}
      </>
    )
  }

  const seats = seatedPlayers(room)
  const seated = seats.filter(Boolean).length
  const fewest = game.players?.[0] ?? 2
  const many = seats.length > 2
  const ready = seated >= fewest
  const agreed = stakeAgreed(room)
  const url = inviteUrl(game.slug, code)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setToast(`Code: ${code}`)
    }
    play('tap')
  }
  const share = async () => {
    try {
      await navigator.share({ title: `${game.name} — Lash vs Seven`, text: `Play ${game.name} with me`, url })
    } catch {
      /* cancelled */
    }
  }
  const start = async () => {
    setStarting(true)
    play('start')
    try {
      await startMatch(game.slug, code, initialState?.(choices[0], choices, seats.flatMap((p, i) => (p ? [i] : []))) ?? {})
    } catch {
      setStarting(false)
      setToast('Couldn’t start. Try again.')
    }
  }

  return (
    <main className="lobby__main lobby__main--wide screen-in">
      <div className="lobby__hero">
        <VsBlock mood={ready ? 'idle' : 'wait'} eyes size={64} />
        <p className="label">Room code</p>
        <div className="code-tiles" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${i * 90}ms` }} aria-hidden="true">{ch}</span>
          ))}
        </div>
      </div>

      <div className="invite-actions">
        <button type="button" className={`btn btn--primary${copied ? ' btn--done' : ''}`} onClick={copy} aria-live="polite">
          {copied ? (
            <>
              <span aria-hidden="true">✓</span> Link copied
            </>
          ) : (
            <>
              <Copy /> Copy invite link
            </>
          )}
        </button>
        {'share' in navigator && (
          <button type="button" className="btn" onClick={share}>Share</button>
        )}
      </div>

      <ul className={`seats${many ? ' seats--many' : ''}`} aria-label="Players">
        {seats.map((p, i) => (
          <li key={i} className={`seat seat--${i}${p ? '' : ' seat--empty'}`}>
            {p ? (
              <>
                <span className="seat__tag">Player {i + 1}</span>
                <span className="seat__name">{p.name}</span>
                <span className="seat__meta">
                  <span className={`dot${p.online ? ' dot--on' : ''}`} aria-hidden="true" />
                  {p.online ? 'Online' : 'Away'}
                  {p.id === room.hostId && <span className="stamp">Host</span>}
                  {room.stake && p.id !== room.hostId && room.stakeOk?.[p.id] === room.stake.text && <span className="stamp stamp--live">In</span>}
                  {p.id === pid && <span className="seat__you">You</span>}
                </span>
              </>
            ) : (
              <>
                <span className="seat__tag">Player {i + 1}</span>
                <span className="seat__name">Waiting<span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
                <span className="seat__meta">{many && i >= fewest ? 'Optional · ' : ''}Send the link to {challengeFor ?? 'a friend'}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="lobby__stack" aria-live="polite">
        {isHost && <OptionPicker options={options} choices={choices} onChange={setChoices} />}
        <StakePanel room={room} />
        {isHost ? (
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!ready || !agreed || starting} onClick={start}>
            {starting ? 'Starting…' : !ready ? 'Waiting for opponent' : !agreed ? 'Waiting for everyone to agree' : many ? `Start with ${seated} players` : 'Start match'} <span className="keycap">↵</span>
          </button>
        ) : (
          <p className="hint lobby__center">Waiting for {seats[0]?.name ?? 'the host'} to start…</p>
        )}
        {many && isHost && ready && seated < seats.length && <p className="hint lobby__center">Up to {seats.length} can play — start now or wait for more.</p>}
        {/* a host with a guest waiting gets a confirm; otherwise leaving costs nobody anything */}
        <button type="button" className="link-btn" onClick={isHost && seated > 1 ? onRequestLeave : leave}>
          {isHost ? 'Close room' : 'Leave room'}
        </button>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  )
}
