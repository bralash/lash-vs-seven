import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useSound } from '../lib/sound'
import { lineFor, linesFor, type LineKey } from '../match/opsLines'
import { OpsFace, useOpsLook, useOpsPronouns, type BaseMood, type OpsMood } from './OpsFace'
import '../styles/pokeops.css'

/**
 * Ops' face where you can touch her — the Play Ops screen and the results. A tap is a poke; hold to
 * pet her. A poke or two and she's sweet; keep at it and she gets twitchy, then cross, then she
 * sulks and won't look at you for a bit. Petting calms her down. Leave her alone and she settles
 * back to how she was (idle in the lobby; her win, loss or shrug on the results).
 */

type Say = [OpsMood, string]

/** Pokes by how fed up she is (the index); each poke picks one of the row at random. */
const POKES: Say[][] = [
  [['hello', 'Hi!'], ['giggle', 'Hehe'], ['giggle', 'That tickles']],
  [['giggle', 'Boop'], ['love', 'Aww'], ['wow', 'Oh, hello']],
  [['wow', 'Yes?'], ['smug', 'Can I help you?'], ['nervous', 'Okay…']],
  [['nervous', 'Personal space'], ['salty', 'Hey!'], ['salty', 'Rude']],
  [['salty', 'Stop that'], ['angry', 'Seriously?'], ['salty', 'Quit it']],
  [['angry', 'STOP.'], ['angry', 'I said stop'], ['angry', 'Grrr']],
]
/** After the last row she turns away for a while and taps get nothing but this. */
const SULK: Say[] = [['sleep', 'Not talking to you'], ['sleep', '…'], ['sleep', 'Ignoring you']]
const PETS: Say[] = [['love', '♥'], ['love', 'Aww, thanks'], ['love', 'Okay, you’re forgiven'], ['giggle', 'Hehe, more']]

/** what she says first on the results, whoever won */
const FIRST: Record<BaseMood, Say[]> = {
  idle: [],
  think: [],
  win: [['smug', 'Good game though'], ['gg', 'Rematch?'], ['smug', 'Still the champ']],
  lose: [['salty', 'Don’t rub it in'], ['unlucky', 'Let me sulk'], ['pity', 'Lucky you']],
  draw: [['wow', 'Close one'], ['gg', 'Again?']],
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
/** a hold this long is a pet, not a poke */
const HOLD_MS = 450
/** a reaction stays up this long before she settles */
const SHOW_MS = 1800
/** every this long without a poke takes one off how fed up she is */
const COOL_MS = 1500
const SULK_MS = 4000

export function PokeOps({ rest = 'idle', size }: { rest?: BaseMood; size: number }) {
  const { play } = useSound()
  const { them } = useOpsPronouns()
  // a character (Kratops, Thanops) says its own words; the face is the same
  const lines = linesFor(useOpsLook())
  const own = ([mood, line]: Say, key: LineKey): Say => [mood, lineFor(lines, key, line)]
  const [say, setSay] = useState<{ mood: OpsMood; line: string; n: number } | null>(null)
  const pokes = useRef({ count: rest === 'lose' ? 2 : 0, at: 0, sulkUntil: 0, n: 0, first: true })
  const hold = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const settle = useRef<number | undefined>(undefined)

  useEffect(() => () => (clearTimeout(hold.current), clearTimeout(settle.current)), [])

  const show = ([mood, line]: Say, ms = SHOW_MS) => {
    const n = ++pokes.current.n
    setSay({ mood, line, n })
    clearTimeout(settle.current)
    settle.current = window.setTimeout(() => setSay(null), ms)
  }

  const poke = () => {
    const p = pokes.current
    const now = Date.now()
    if (now < p.sulkUntil) {
      show(own(pick(SULK), 'sulk'))
      return
    }
    p.count = Math.max(0, p.count - Math.floor((now - p.at) / COOL_MS)) + 1
    p.at = now
    if (p.first && FIRST[rest].length) {
      p.first = false
      play('tap')
      show(own(pick(FIRST[rest]), rest === 'win' ? 'results_win' : rest === 'lose' ? 'results_lose' : 'results_draw'))
      return
    }
    p.first = false
    const row = Math.ceil(p.count / 2) - 1
    if (row >= POKES.length) {
      p.count = 0
      p.sulkUntil = now + SULK_MS
      play('error')
      show(own(pick(SULK), 'sulk'), SULK_MS)
      return
    }
    const s = own(pick(POKES[row]), `poke_${row + 1}` as LineKey)
    play(s[0] === 'angry' || s[0] === 'salty' ? 'error' : 'tap')
    show(s)
  }

  const pet = () => {
    const p = pokes.current
    p.count = Math.max(0, p.count - 4)
    p.sulkUntil = 0
    p.at = Date.now()
    play('find')
    show(own(pick(PETS), 'pet'), 2200)
  }

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    held.current = false
    clearTimeout(hold.current)
    hold.current = window.setTimeout(() => {
      held.current = true
      pet()
    }, HOLD_MS)
  }
  const up = () => {
    clearTimeout(hold.current)
    if (!held.current) poke()
    held.current = false
  }

  return (
    <span className="poke">
      <button
        type="button"
        className="poke__btn"
        aria-label={`Poke Ops (hold to pet ${them})`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={() => clearTimeout(hold.current)}
        onPointerCancel={() => clearTimeout(hold.current)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), poke())}
      >
        <OpsFace key={say ? say.n : rest} mood={say?.mood ?? rest} size={size} />
      </button>
      {say && (
        <span key={say.n} className="poke__said" role="status">
          {say.line}
        </span>
      )}
    </span>
  )
}
