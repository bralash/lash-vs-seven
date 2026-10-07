import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { TARGETS } from '../anagram/words'
import { MAX_LEN, MAX_WRONG, checkWord } from './engine'

/* ── The secret word, kept on the setter's device only ─────────────────── */

export interface Secret {
  word: string
  salt: string
}
// sessionStorage: survives a refresh mid-round, never leaves this tab
const secretKey = (id: string) => `lvs_hm:${id}`
export function loadSecret(id: string): Secret | null {
  try {
    const raw = sessionStorage.getItem(secretKey(id))
    return raw ? (JSON.parse(raw) as Secret) : null
  } catch {
    return null
  }
}
export function saveSecret(id: string, s: Secret) {
  try {
    sessionStorage.setItem(secretKey(id), JSON.stringify(s))
  } catch {
    /* storage blocked: the word lives in memory for this page only */
  }
}

/* ── Gallows ──────────────────────────────────────────────────────────── */

type Mood = 'smile' | 'flat' | 'worried' | 'dead' | 'happy'

/**
 * The frame draws itself in at the start of a round (remount it per round). Each wrong guess drops
 * in one part and makes him flinch; his face sours as the guesses run out. Escaping snaps the rope:
 * he lands, gets his arms up and jumps. Hanged: he swings with x-ed out eyes.
 */
export function Gallows({ wrong, outcome }: { wrong: number; outcome?: 'escaped' | 'hanged' | 'forfeit' }) {
  const hanged = outcome === 'hanged'
  const escaped = outcome === 'escaped' || outcome === 'forfeit'
  // getting out means all of him: any parts not drawn yet join the celebration
  const shown = escaped ? MAX_WRONG : wrong
  const mood: Mood = hanged ? 'dead' : escaped ? 'happy' : wrong >= 5 ? 'worried' : wrong >= 3 ? 'flat' : 'smile'
  const armY = escaped ? 52 : 76
  const parts = [
    <circle key="head" cx="86" cy="44" r="11" />,
    <path key="body" d="M86 55v34" />,
    <path key="armL" d={`M86 64L72 ${armY}`} />,
    <path key="armR" d={`M86 64L100 ${armY}`} />,
    <path key="legL" d="M86 89l-12 18" />,
    <path key="legR" d="M86 89l12 18" />,
  ]
  return (
    <svg
      className={`hm-gallows${hanged ? ' hm-gallows--hanged' : ''}${escaped ? ' hm-gallows--escaped' : ''}`}
      viewBox="0 0 130 140"
      role="img"
      aria-label={escaped ? 'Escaped' : hanged ? 'Hanged' : `${wrong} of ${MAX_WRONG} wrong`}
    >
      <g className="hm-gallows__frame">
        {['M14 130h70', 'M34 130V10', 'M34 10h52', 'M34 34l22-24'].map((d, i) => (
          <path key={d} d={d} pathLength={1} style={{ '--i': i } as CSSProperties} />
        ))}
      </g>
      <path className="hm-gallows__rope" d="M86 10v22" pathLength={1} />
      <g className="hm-gallows__body">
        {/* switching the animation name restarts it: one flinch per wrong guess */}
        <g className={`hm-gallows__man${wrong && !outcome ? ` hm-flinch-${wrong % 2}` : ''}`}>
          {parts.slice(0, shown)}
          {shown > 0 && <Face mood={mood} />}
        </g>
      </g>
      {escaped && (
        <g className="hm-gallows__burst">
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x="84" y="58" width="5" height="5" style={{ '--a': `${i * 36}deg` } as CSSProperties} />
          ))}
        </g>
      )}
    </svg>
  )
}

function Face({ mood }: { mood: Mood }) {
  const mouth = {
    smile: 'M82 48q4 3.5 8 0',
    flat: 'M82 49h8',
    worried: 'M81.5 50q2.2-2.6 4.5 0t4.5 0',
    dead: 'M83 50.5q3-3 6 0',
    happy: 'M80.5 47q5.5 6 11 0',
  }[mood]
  return (
    <g className={`hm-face hm-face--${mood}`}>
      {mood === 'dead' ? (
        <path className="hm-face__x" d="M80.5 38.5l4 4M84.5 38.5l-4 4M87.5 38.5l4 4M91.5 38.5l-4 4" />
      ) : (
        <g className="hm-face__eyes">
          <rect x="81" y="38.5" width="3" height="4.5" />
          <rect x="88" y="38.5" width="3" height="4.5" />
        </g>
      )}
      <path className="hm-face__mouth" d={mouth} />
    </g>
  )
}

/* ── The word, as tiles ───────────────────────────────────────────────── */

/**
 * `masked` is what's been found ('_' for the rest). `word` (the setter's own view, or the reveal)
 * fills the gaps in a lighter style so you can see what wasn't found.
 */
export function WordTiles({ masked, word, lastLetter }: { masked: string; word?: string; lastLetter?: string }) {
  const long = masked.length > 10
  return (
    <div className={`hm-word${long ? ' hm-word--long' : ''}`} aria-label={`Word: ${masked.replace(/_/g, ' blank ')}`}>
      {masked.split('').map((c, i) => {
        const shown = c !== '_' ? c : word?.[i]
        return (
          <span key={i} className={`hm-tile${c !== '_' ? ' hm-tile--found' : shown ? ' hm-tile--missed' : ''}${c === lastLetter ? ' hm-tile--new' : ''}`}>
            {shown ?? ''}
          </span>
        )
      })}
    </div>
  )
}

/* ── Keyboard ─────────────────────────────────────────────────────────── */

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** Tap a letter. Keys go green (in the word) or dark (not) once answered; the pending one pulses. */
export function Keyboard({
  guessed,
  word,
  masked,
  pending,
  enabled,
  onKey,
}: {
  guessed: string
  /** the setter knows the word; the guesser only knows what's been found */
  word?: string
  masked: string
  pending?: string
  enabled: boolean
  onKey: (l: string) => void
}) {
  const state = (l: string) => {
    if (l === pending) return 'pending'
    if (!guessed.includes(l)) return word?.includes(l) ? 'secret' : ''
    return masked.includes(l) ? 'hit' : 'miss'
  }
  return (
    <div className="hm-keys" role="group" aria-label="Letters">
      {ROWS.map((row) => (
        <div key={row} className="hm-keys__row">
          {row.split('').map((l) => {
            const s = state(l)
            const used = s === 'hit' || s === 'miss' || s === 'pending'
            return (
              <button
                key={l}
                type="button"
                className={`hm-key${s ? ` hm-key--${s}` : ''}`}
                disabled={!enabled || used}
                onClick={() => onKey(l)}
                aria-label={`${l}${s === 'hit' ? ', in the word' : s === 'miss' ? ', not in the word' : ''}`}
              >
                {l}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ── Picking the word ─────────────────────────────────────────────────── */

const pickThree = () => {
  const out = new Set<string>()
  while (out.size < 3) out.add(TARGETS[Math.floor(Math.random() * TARGETS.length)])
  return [...out]
}

/**
 * Tap a suggestion (no typing needed) or type your own; optional hint when the room has hints on.
 * `hide`: the guesser is in the room (pass & play), so the word shows as dots unless you peek.
 */
export function WordPicker({ hints, hide, guesserName, onLock }: { hints: boolean; hide: boolean; guesserName: string; onLock: (word: string, hint: string) => void }) {
  const [peek, setPeek] = useState(false)
  const masked = hide && !peek
  const [ideas, setIdeas] = useState(pickThree)
  const [word, setWord] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const wordId = useId()
  const hintId = useId()

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const c = checkWord(word)
    if ('error' in c) return setError(c.error)
    setBusy(true)
    onLock(c.word, hint.trim().slice(0, 40))
  }

  return (
    <form className="hm-pick" onSubmit={submit}>
      <p className="hm-pick__lead">
        Pick a word for <strong>{guesserName}</strong> to guess. Only its length is shared.
      </p>
      <div className="hm-pick__ideas">
        {ideas.map((w) => (
          <button key={w} type="button" className={`btn hm-idea${word === w ? ' hm-idea--on' : ''}`} onClick={() => (setWord(w), setError(''))}>
            {w}
          </button>
        ))}
        <button type="button" className="btn hm-idea hm-idea--more" onClick={() => setIdeas(pickThree)} aria-label="Three more words">
          ↻
        </button>
      </div>
      <div className="field-card hm-field">
        <label className="label" htmlFor={wordId}>
          Or type your own{word && <span className="hm-field__count"> · {word.length} letter{word.length === 1 ? '' : 's'}</span>}
        </label>
        {hide && (
          <button type="button" className="hm-peek" onClick={() => setPeek((v) => !v)} aria-pressed={peek} aria-label={peek ? 'Hide word' : 'Show word'}>
            {peek ? <EyeOff /> : <Eye />}
          </button>
        )}
        <input
          id={wordId}
          value={word}
          onChange={(e) => (setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')), setError(''))}
          placeholder="Secret word"
          maxLength={MAX_LEN}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={masked ? 'hm-secret-input' : undefined}
          inputMode="text"
        />
      </div>
      {hints && (
        <div className="field-card hm-field hm-field--hint">
          <label className="label" htmlFor={hintId}>
            Hint (optional)
          </label>
          <input id={hintId} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. a fruit" maxLength={40} autoComplete="off" />
        </div>
      )}
      <p className="hm-pick__error" role="alert">
        {error}
      </p>
      <button type="submit" className="btn btn--primary btn--lg" disabled={busy || !word}>
        Lock it in <span className="keycap">↵</span>
      </button>
    </form>
  )
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function EyeOff() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <path d="M4 20L20 4" />
    </svg>
  )
}
