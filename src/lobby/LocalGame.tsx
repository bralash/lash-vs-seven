import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { GameMeta } from '../games/registry'
import { useSound } from '../lib/sound'
import { KEYS, load, save } from '../lib/storage'
import { BOT_NAME, LEVELS, type Brain, type Level, type OpsSense } from '../match/bot'
import { PokeOps } from '../components/PokeOps'
import { LocalSessionProvider, type Session } from '../match/session'
import { useWear } from '../components/faces/wardrobe'
import { LooksProvider, WearsProvider, looksFor, wearsFor } from '../match/looks'
import { UltEarn } from '../match/Ultimates'
import { OPS_LOOK, useCrewLook } from '../components/OpsFace'
import { OptionPicker, optionList, type MatchExit, type MatchOption, type Me } from './Lobby'
import type { AnySeat, Room, Seat } from './rooms'
import { floorOf, twistOf, winsNeeded } from '../tower/floors'
import { TowerClock } from '../tower/TowerClock'
import { SCORED } from '../tower/barrage'
import { unleash } from '../match/Ultimates'
import { settleFloor } from '../tower/tower'
import { TowerSheet, type SheetState } from '../tower/TowerSheet'
import { touchProfile } from '../lib/profile'

/** A pass-and-play match: the names (two, or up to four in games for more), the host's option, and the whole game state, all on this device. */
export interface LocalMatch {
  names: string[]
  state: Record<string, unknown>
  /** when the players sat down — tells this pass & play match apart from earlier ones (rivalry record) */
  startedAt?: number
  /** playing Ops at this level (Ops is seat 1) */
  bot?: Level
  /** a floor of Ops' Tower (src/tower): Ops plays as the floor's guardian */
  tower?: TowerRun
}

export interface TowerRun {
  floor: number
  /** games won on this floor so far (floors that take more than one), by seat */
  wins: [number, number]
  /** the last match end counted, so a re-render or refresh never counts it twice */
  counted?: string
  /** the floor's result is in (or being saved) */
  done?: 'won' | 'lost'
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
  vsBot,
  onStart,
  onBack,
}: {
  game: GameMeta
  option?: MatchOption | MatchOption[]
  initialState?: (choice?: string, all?: string[], seats?: number[]) => Record<string, unknown>
  /** setting up a game against Ops: one name, plus how hard Ops plays */
  vsBot?: boolean
  onStart: (m: LocalMatch) => void
  onBack: () => void
}) {
  const [names, setNames] = useState<string[]>(() => [load(KEYS.name) ?? '', load(KEYS.name2) ?? '', '', ''])
  const options = optionList(option)
  const [choices, setChoices] = useState(() => options.map((o) => o.initial))
  const [level, setLevel] = useState<Level>(() => (load(KEYS.botLevel) as Level | null) ?? 'medium')
  // games for more than two: how many are sharing this device (Ops plays one-on-one)
  const [fewest, most] = game.players ?? [2, 2]
  const [count, setCount] = useState(fewest)
  const seats = vsBot ? 1 : count
  const { play } = useSound()

  const start = (e: FormEvent) => {
    e.preventDefault()
    const clean = names.slice(0, vsBot ? 2 : count).map((n, i) => n.trim().slice(0, 16) || `Player ${i + 1}`)
    if (names[0].trim()) {
      save(KEYS.name, clean[0])
      touchProfile()
    }
    if (vsBot) {
      save(KEYS.botLevel, level)
      clean[1] = BOT_NAME
    } else if (names[1].trim()) save(KEYS.name2, clean[1])
    play('start')
    onStart({ names: clean, state: initialState?.(choices[0], choices, clean.map((_, i) => i)) ?? {}, startedAt: Date.now(), ...(vsBot ? { bot: level } : {}) })
  }

  return (
    <main className="lobby__main screen-in">
      <div className="lobby__hero">
        {vsBot && <PokeOps size={64} />}
        <p className="label">{vsBot ? `You vs ${BOT_NAME}` : <>Pass &amp; play</>}</p>
        <h1 className="lobby__title">{game.name}</h1>
        <p className="hint">{vsBot ? `No friend handy? ${BOT_NAME} will play you` : 'One device · take turns · no room needed'}</p>
      </div>

      <form className="lobby__stack" onSubmit={start}>
        {!vsBot && most > fewest && (
          <OptionPicker
            options={[{ label: 'Players', initial: String(fewest), choices: Array.from({ length: most - fewest + 1 }, (_, i) => ({ value: String(fewest + i), label: String(fewest + i) })) }]}
            choices={[String(count)]}
            onChange={([c]) => setCount(Number(c))}
          />
        )}
        <div className={`local-names${seats > 2 ? ' local-names--many' : ''}`}>
          {Array.from({ length: seats }, (_, i) => (
            <LocalName
              key={i}
              seat={i as AnySeat}
              value={names[i]}
              autoFocus={i === 0 && !names[0]}
              label={vsBot ? 'Your name' : undefined}
              onChange={(v) => setNames((n) => n.map((x, j) => (j === i ? v : x)))}
            />
          ))}
        </div>
        {vsBot && (
          <OptionPicker
            options={[{ label: `How hard ${BOT_NAME} plays`, initial: 'medium', choices: LEVELS }]}
            choices={[level]}
            onChange={([l]) => setLevel(l as Level)}
          />
        )}
        <OptionPicker options={options} choices={choices} onChange={setChoices} />
        <button type="submit" className="btn btn--primary btn--lg btn--block">
          Start game <span className="keycap">↵</span>
        </button>
        <button type="button" className="link-btn" onClick={onBack}>
          {game.modes === 'vs Ops' || game.modes === 'local' ? 'Back' : 'Play online instead'}
        </button>
      </form>
    </main>
  )
}

function LocalName({ seat, value, onChange, autoFocus, label }: { seat: AnySeat; value: string; onChange: (v: string) => void; autoFocus?: boolean; label?: string }) {
  const id = useId()
  return (
    <div className={`field-card local-name local-name--${seat}`}>
      <label className="label" htmlFor={id}>
        {label ?? `Player ${seat + 1}`}
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

/** the barrage twist fires at most this often (an Ultimate runs about three seconds) */
const BARRAGE_GAP_MS = 6000

export function LocalGame({
  game,
  match,
  onChange,
  exit,
  renderGame,
  brain,
  sense,
  onTowerAgain,
  onTowerExit,
}: {
  game: GameMeta
  match: LocalMatch
  onChange: (m: LocalMatch) => void
  exit: MatchExit
  renderGame: (room: Room, me: Me, exit: MatchExit) => ReactNode
  /** how Ops picks its moves, when this is a game against Ops */
  brain?: Brain
  /** how a game's end reads, so its winner charges an ultimate */
  sense?: OpsSense
  /** a Tower floor: play the floor again (or its next game), keeping these wins */
  onTowerAgain?: (wins: [number, number]) => void
  /** a Tower floor: back to the Tower */
  onTowerExit?: () => void
}) {
  const level = brain ? match.bot : undefined
  const crewLook = useCrewLook()
  const wear = useWear()
  const [state, setState] = useState(match.state)
  const [startedAt] = useState(() => match.startedAt ?? Date.now())
  const [tower, setTower] = useState(match.tower)
  const [sheet, setSheet] = useState<SheetState | null>(null)

  // keep the lobby (and the tab's storage) in step, so a refresh resumes the game
  useEffect(() => {
    onChange({ names: match.names, state, startedAt, ...(match.bot ? { bot: match.bot } : {}), ...(tower ? { tower } : {}) })
  }, [state, match.names, startedAt, match.bot, tower, onChange])

  // a Tower floor: when a match ends, count it towards the floor (once), and settle the floor when it's decided
  const settle = (run: TowerRun, key: string) => {
    const won = run.done === 'won'
    setSheet({ kind: 'saving', won })
    settleFloor(run.floor, won, key).then((out) => setSheet(out ? { kind: 'done', out } : { kind: 'error', won }))
  }
  useEffect(() => {
    if (!tower || !sense) return
    const key = `${startedAt}:${(state as { match?: number }).match ?? 0}`
    if (tower.counted === key) {
      // decided before a refresh, maybe unsaved: saving again is safe (the climb remembers the key)
      if (tower.done && !sheet) settle(tower, key)
      return
    }
    const end = sense.ended(state)
    if (!end?.final || tower.done) return
    const need = winsNeeded(floorOf(tower.floor))
    if (end.winner === -1) {
      setTower({ ...tower, counted: key })
      setSheet({ kind: 'draw' })
      return
    }
    const wins: [number, number] = [...tower.wins]
    wins[end.winner]++
    if (wins[0] < need && wins[1] < need) {
      setTower({ ...tower, wins, counted: key })
      setSheet({ kind: 'next', wins })
      return
    }
    const run: TowerRun = { ...tower, wins, counted: key, done: wins[0] >= need ? 'won' : 'lost' }
    setTower(run)
    settle(run, key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tower, sense, startedAt])

  const session = useMemo<Session>(
    () => ({
      // against Ops the screens word it like an online match: "Your turn", "Ops wins"
      local: !level,
      bot: !!level,
      level,
      move: (mutate) => {
        setState((prev) => {
          const next = mutate(prev.live as never)
          return next === undefined ? prev : { ...prev, live: next }
        })
        return Promise.resolve(true)
      },
      // one device: "play again" is both players at once, and the screen's host logic deals it
      ready: () => setState((prev) => ({ ...prev, ready: Object.fromEntries(match.names.map((_, i) => [`p${i}`, true])) })),
      start: (next) => setState(next),
    }),
    [level, match.names],
  )

  // Ops thinks for a moment, then moves. Any change to the state (including its own move) re-checks.
  const sessionRef = useRef(session)
  sessionRef.current = session
  useEffect(() => {
    if (!brain || !level) return
    const move = brain(state, level)
    if (!move) return
    const t = setTimeout(() => sessionRef.current.move(move as (live: unknown) => unknown), 550 + Math.random() * 650)
    return () => clearTimeout(t)
  }, [state, brain, level])

  // the barrage twist: the guardian fires its Ultimate when it scores (a box, a ship, a piece), at most every few seconds; looks only
  const floor = tower ? floorOf(tower.floor) : undefined
  const barrage = !!twistOf(floor, 'barrage')
  const prevState = useRef(state)
  const firedAt = useRef(0)
  useEffect(() => {
    const prev = prevState.current
    prevState.current = state
    const scored = SCORED[game.slug]
    if (!barrage || !scored || prev === state || !scored(prev, state)) return
    if (Date.now() - firedAt.current < BARRAGE_GAP_MS) return
    firedAt.current = Date.now()
    setTimeout(() => unleash('p1', false), 350)
  }, [state, barrage, game.slug])
  const clockSecs = twistOf(floor, 'clock')?.secs

  const room: Room = {
    game: game.slug,
    code: 'LOCAL',
    status: 'playing',
    hostId: 'p0',
    createdAt: startedAt,
    ...(match.names.length > 2 ? { seatCount: match.names.length } : {}),
    players: Object.fromEntries(match.names.map((name, i) => [`p${i}`, { name, seat: i as AnySeat, online: true, joinedAt: 0 }])),
    state,
  }
  // the device belongs to whoever's turn it is — or, against Ops, always to you
  const turn = ((state.live as { turn?: AnySeat } | undefined)?.turn ?? 0) as AnySeat
  const seat: AnySeat = level ? 0 : turn
  const me: Me = { id: `p${seat}`, seat: (seat < 2 ? seat : 0) as Seat, seatN: seat, isHost: true }

  // against Ops: you wear your character (if you picked one) and she wears her own face; in pass & play every face is drawn for the match
  // on a Tower floor she plays as its guardian (and you don't get the same face)
  const guardian = tower ? floorOf(tower.floor)?.guardian : undefined
  const looks = looksFor(room, level ? { p1: guardian ?? OPS_LOOK, ...(crewLook && crewLook !== guardian ? { p0: crewLook } : {}) } : {})
  // against Ops you bring what your character has on too
  const wears = wearsFor(room, level && crewLook ? { p0: wear } : {})

  return (
    <LocalSessionProvider value={session}>
      <UltEarn room={room} sense={sense} />
      <LooksProvider value={looks}>
        <WearsProvider value={wears}>{renderGame(room, me, exit)}</WearsProvider>
      </LooksProvider>
      {tower && clockSecs && !sheet && <TowerClock game={game.slug} state={state} secs={clockSecs} onOut={(m) => session.move(m as (live: unknown) => unknown)} />}
      {tower && sheet && (
        <TowerSheet
          floor={tower.floor}
          sheet={sheet}
          onAgain={() => onTowerAgain?.(sheet.kind === 'next' || sheet.kind === 'draw' ? tower.wins : [0, 0])}
          onTower={() => onTowerExit?.()}
          onRetry={() => settle(tower, tower.counted ?? '')}
        />
      )}
    </LocalSessionProvider>
  )
}
