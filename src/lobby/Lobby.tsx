import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { HowToPlay } from '../components/HowToPlay'
import { ArrowLeft, Copy, Exit } from '../components/Icons'
import { TopBar } from '../components/TopBar'
import type { GameMeta } from '../games/registry'
import { useSound } from '../lib/sound'
import { playerId, signIn } from '../lib/firebase'
import { KEYS, hasLeft, load, markLeft, save } from '../lib/storage'
import {
  CODE_LENGTH,
  createRoom,
  inviteUrl,
  joinRoom,
  leaveRoom,
  normalizeCode,
  peekRoom,
  playersBySeat,
  startMatch,
  trackPresence,
  type JoinFailure,
  type Room,
} from './rooms'
import { ConfirmLeave, type LeaveKind } from './ConfirmLeave'
import { LocalGame, LocalSetup, loadLocal, saveLocal, type LocalMatch } from './LocalGame'
import { useRoom } from './useRoom'
import '../styles/lobby.css'

export interface MatchOption {
  label: string
  choices: { value: string; label: string }[]
  initial: string
}

export interface MatchExit {
  /** asks "Leave the match?" first — use while the match is live */
  request: () => void
  /** leaves straight away — for screens where the match is already over */
  now: () => void
}

export interface Me {
  id: string
  seat: 0 | 1
  isHost: boolean
}

interface Props {
  game: GameMeta
  /** Rendered once the host starts the match. */
  renderGame: (room: Room, me: Me, exit: MatchExit) => ReactNode
  /** Initial game state written when the host presses Start. */
  initialState?: (choice?: string) => Record<string, unknown>
  /** a setting the host picks in the waiting room (e.g. best of 3/5/7), passed to initialState */
  option?: MatchOption
}

const FAILURE_COPY: Record<JoinFailure, string> = {
  missing: 'That room doesn’t exist or has closed.',
  started: 'That match has already started.',
  full: 'That room already has two players.',
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
  /** identifies the match, so the back-buffer below is pushed once per match */
  key: string
  /** what confirming does: end the online match, or drop the pass-and-play game */
  leave: () => void
}

export function Lobby({ game, renderGame, initialState, option }: Props) {
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
  const [local, setLocal] = useState<LocalMatch | null>(() => (canLocal ? loadLocal(game.slug) : null))
  const [setup, setSetup] = useState(false)
  const endLocal = useCallback(() => {
    saveLocal(game.slug, null)
    setLocal(null)
    setSetup(false)
  }, [game.slug])
  const keepLocal = useCallback((m: LocalMatch) => saveLocal(game.slug, m), [game.slug])
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
    setParams({}, { replace: true })
  }

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

  let screen: ReactNode
  if (local) {
    screen = (
      <LocalGame
        game={game}
        match={local}
        onChange={keepLocal}
        exit={{ request: () => setAsking(true), now: endLocal }}
        renderGame={renderGame}
      />
    )
  } else if (setup) {
    screen = (
      <LocalSetup
        game={game}
        option={option}
        initialState={initialState}
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
      />
    )
  } else if (urlCode && invite) {
    screen = <InviteScreen game={game} code={urlCode} invite={invite} onJoined={enterRoom} onDismiss={exitRoom} />
  } else {
    screen = <StartScreen game={game} onEnter={enterRoom} onLocal={canLocal ? () => setSetup(true) : undefined} />
  }

  return (
    <div className="page lobby">
      <TopBar
        left={
          inMatch ? (
            // mid-match the only way out is the Leave button, so there's no back arrow to mis-tap
            <span className="topbar__title">
              {game.name}
              <span className="hide-sm">{local ? ' · Pass & play' : ` · Room ${inRoom}`}</span>
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
        right={rulesBtn}
        end={
          inMatch && (
            <button type="button" className="icon-btn icon-btn--leave" onClick={() => setAsking(true)}>
              <Exit /> Leave
            </button>
          )
        }
      />
      {screen}
      {showRules && game.rules && <HowToPlay rules={game.rules} onClose={() => setShowRules(false)} />}
      {confirming && guard && <ConfirmLeave kind={guard.kind} other={guard.other} onStay={stay} onLeave={confirmLeave} />}
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

function StartScreen({ game, onEnter, onLocal }: { game: GameMeta; onEnter: (code: string) => void; onLocal?: () => void }) {
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
      const c = await createRoom(game.slug, n)
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
          <button type="button" className="btn btn--block lobby__local" onClick={onLocal}>
            Pass &amp; play
          </button>
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
}: {
  game: GameMeta
  code: string
  onExit: () => void
  onGuard: (g: LeaveGuard | null) => void
  onRequestLeave: () => void
  renderGame: Props['renderGame']
  initialState?: Props['initialState']
  option?: MatchOption
}) {
  const live = useRoom(game.slug, code)
  const [toast, setToast] = useState('')
  const [starting, setStarting] = useState(false)
  const [choice, setChoice] = useState(option?.initial)
  const { play } = useSound()
  const pid = playerId()

  useEffect(() => trackPresence(game.slug, code), [game.slug, code])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // chime when the opponent arrives
  const count = live.status === 'ready' ? Object.keys(live.room.players ?? {}).length : 0
  useEffect(() => {
    if (count === 2) play('join')
  }, [count, play])

  // Tell the lobby when leaving needs a confirmation: during a match, or when a host has a guest waiting.
  const snapshot = live.status === 'ready' ? live.room : null
  useEffect(() => {
    const mine = snapshot?.players?.[pid]
    if (!snapshot || !mine) return onGuard(null)
    const other = Object.entries(snapshot.players).find(([id]) => id !== pid)?.[1]?.name ?? null
    const leave = () => {
      leaveRoom(game.slug, snapshot)
      markLeft(game.slug, snapshot.code)
    }
    if (snapshot.status === 'abandoned') onGuard(null) // match already over — nothing to protect
    else if (snapshot.status !== 'waiting') onGuard({ kind: 'match', other, key: snapshot.code, leave })
    else if (snapshot.hostId === pid && other) onGuard({ kind: 'close', other, key: snapshot.code, leave })
    else onGuard(null)
  }, [snapshot, pid, onGuard, game.slug])
  useEffect(() => () => onGuard(null), [onGuard])

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

  if (room.status !== 'waiting') {
    return <>{renderGame(room, { id: pid, seat: me.seat, isHost }, { request: onRequestLeave, now: leave })}</>
  }

  const seats = playersBySeat(room)
  const ready = seats[0] && seats[1]
  const url = inviteUrl(game.slug, code)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setToast('Invite link copied')
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
      await startMatch(game.slug, code, initialState?.(choice) ?? {})
    } catch {
      setStarting(false)
      setToast('Couldn’t start. Try again.')
    }
  }

  return (
    <main className="lobby__main lobby__main--wide screen-in">
      <div className="lobby__hero">
        <p className="label">Room code</p>
        <div className="code-tiles" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${i * 90}ms` }} aria-hidden="true">{ch}</span>
          ))}
        </div>
      </div>

      <div className="invite-actions">
        <button type="button" className="btn btn--primary" onClick={copy}>
          <Copy /> Copy invite link
        </button>
        {'share' in navigator && (
          <button type="button" className="btn" onClick={share}>Share</button>
        )}
      </div>

      <ul className="seats" aria-label="Players">
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
                  {p.id === pid && <span className="seat__you">You</span>}
                </span>
              </>
            ) : (
              <>
                <span className="seat__tag">Player {i + 1}</span>
                <span className="seat__name">Waiting<span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
                <span className="seat__meta">Send the link to a friend</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="lobby__stack" aria-live="polite">
        {isHost && option && (
          <div className="lobby-option">
            <span className="label">{option.label}</span>
            <div className="seg" role="group" aria-label={option.label}>
              {option.choices.map((c) => (
                <button key={c.value} type="button" className="seg__btn" aria-pressed={choice === c.value} onClick={() => setChoice(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {isHost ? (
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!ready || starting} onClick={start}>
            {starting ? 'Starting…' : ready ? 'Start match' : 'Waiting for opponent'} <span className="keycap">↵</span>
          </button>
        ) : (
          <p className="hint lobby__center">Waiting for {seats[0]?.name ?? 'the host'} to start…</p>
        )}
        {/* a host with a guest waiting gets a confirm; otherwise leaving costs nobody anything */}
        <button type="button" className="link-btn" onClick={isHost && seats[1] ? onRequestLeave : leave}>
          {isHost ? 'Close room' : 'Leave room'}
        </button>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  )
}
