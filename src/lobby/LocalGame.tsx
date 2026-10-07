import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { GameMeta } from '../games/registry'
import { useSound } from '../lib/sound'
import { KEYS, load, save } from '../lib/storage'
import { LocalSessionProvider, type Session } from '../match/session'
import type { MatchExit, MatchOption, Me } from './Lobby'
import type { Room, Seat } from './rooms'

/** A pass-and-play match: two names, the host's option, and the whole game state, all on this device. */
export interface LocalMatch {
  names: [string, string]
  state: Record<string, unknown>
  /** when the players sat down — tells this pass & play match apart from earlier ones (rivalry record) */
  startedAt?: number
}

// Kept for the tab's lifetime, so a refresh mid-game picks up where you were.
const storeKey = (slug: string) => `lvs_local:${slug}`
export function loadLocal(slug: string): LocalMatch | null {
  try {
    const raw = sessionStorage.getItem(storeKey(slug))
    return raw ? (JSON.parse(raw) as LocalMatch) : null
  } catch {
    return null
  }
}
export function saveLocal(slug: string, m: LocalMatch | null) {
  try {
    if (m) sessionStorage.setItem(storeKey(slug), JSON.stringify(m))
    else sessionStorage.removeItem(storeKey(slug))
  } catch {
    /* storage unavailable: the game still works, it just won't survive a refresh */
  }
}

/* ── Setup: both names on one screen ────────────────────────────────────── */

export function LocalSetup({
  game,
  option,
  initialState,
  onStart,
  onBack,
}: {
  game: GameMeta
  option?: MatchOption
  initialState?: (choice?: string) => Record<string, unknown>
  onStart: (m: LocalMatch) => void
  onBack: () => void
}) {
  const [names, setNames] = useState<[string, string]>(() => [load(KEYS.name) ?? '', load(KEYS.name2) ?? ''])
  const [choice, setChoice] = useState(option?.initial)
  const { play } = useSound()

  const start = (e: FormEvent) => {
    e.preventDefault()
    const clean = names.map((n, i) => n.trim().slice(0, 16) || `Player ${i + 1}`) as [string, string]
    if (names[0].trim()) save(KEYS.name, clean[0])
    if (names[1].trim()) save(KEYS.name2, clean[1])
    play('start')
    onStart({ names: clean, state: initialState?.(choice) ?? {}, startedAt: Date.now() })
  }

  return (
    <main className="lobby__main screen-in">
      <div className="lobby__hero">
        <p className="label">Pass &amp; play</p>
        <h1 className="lobby__title">{game.name}</h1>
        <p className="hint">One device · take turns · no room needed</p>
      </div>

      <form className="lobby__stack" onSubmit={start}>
        <div className="local-names">
          {[0, 1].map((i) => (
            <LocalName
              key={i}
              seat={i as Seat}
              value={names[i]}
              autoFocus={i === 0 && !names[0]}
              onChange={(v) => setNames((n) => (i === 0 ? [v, n[1]] : [n[0], v]))}
            />
          ))}
        </div>
        {option && (
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
        <button type="submit" className="btn btn--primary btn--lg btn--block">
          Start game <span className="keycap">↵</span>
        </button>
        <button type="button" className="link-btn" onClick={onBack}>
          Play online instead
        </button>
      </form>
    </main>
  )
}

function LocalName({ seat, value, onChange, autoFocus }: { seat: Seat; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const id = useId()
  return (
    <div className={`field-card local-name local-name--${seat}`}>
      <label className="label" htmlFor={id}>
        Player {seat + 1}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Player ${seat + 1}`}
        maxLength={16}
        autoComplete="off"
        autoFocus={autoFocus}
        spellCheck={false}
      />
    </div>
  )
}

/* ── The match itself, driven by an in-memory session ───────────────────── */

export function LocalGame({
  game,
  match,
  onChange,
  exit,
  renderGame,
}: {
  game: GameMeta
  match: LocalMatch
  onChange: (m: LocalMatch) => void
  exit: MatchExit
  renderGame: (room: Room, me: Me, exit: MatchExit) => ReactNode
}) {
  const [state, setState] = useState(match.state)
  const [startedAt] = useState(() => match.startedAt ?? Date.now())

  // keep the lobby (and the tab's storage) in step, so a refresh resumes the game
  useEffect(() => {
    onChange({ names: match.names, state, startedAt })
  }, [state, match.names, startedAt, onChange])

  const session = useMemo<Session>(
    () => ({
      local: true,
      move: (mutate) => {
        setState((prev) => {
          const next = mutate(prev.live as never)
          return next === undefined ? prev : { ...prev, live: next }
        })
        return Promise.resolve(true)
      },
      // one device: "play again" is both players at once, and the screen's host logic deals it
      ready: () => setState((prev) => ({ ...prev, ready: { p0: true, p1: true } })),
      start: (next) => setState(next),
    }),
    [],
  )

  const room: Room = {
    game: game.slug,
    code: 'LOCAL',
    status: 'playing',
    hostId: 'p0',
    createdAt: startedAt,
    players: {
      p0: { name: match.names[0], seat: 0, online: true, joinedAt: 0 },
      p1: { name: match.names[1], seat: 1, online: true, joinedAt: 0 },
    },
    state,
  }
  // the device belongs to whoever's turn it is
  const turn = ((state.live as { turn?: Seat } | undefined)?.turn ?? 0) as Seat
  const me: Me = { id: `p${turn}`, seat: turn, isHost: true }

  return <LocalSessionProvider value={session}>{renderGame(room, me, exit)}</LocalSessionProvider>
}
