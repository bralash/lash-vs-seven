import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { dictionaryReady, inDictionary } from '../../lib/dictionary'
import { LEN, MAX_GUESSES, SOLVED, type Guess } from './engine'
import { ANSWERS } from './words'

/* ── Words ──────────────────────────────────────────────────────────── */

const KNOWN = new Set(ANSWERS)
/** Secret words come from the common list, so nobody hides an obscure one. */
export const isSecretWord = (w: string) => KNOWN.has(w)
/** Any real word counts as a guess (the common list until the full dictionary has loaded). */
export const isGuessWord = (w: string) => KNOWN.has(w) || inDictionary(w)
export const randomWord = () => ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
/** why a word isn't accepted yet, or '' */
export function problem(w: string, secret: boolean): string {
  if (w.length < LEN) return 'Not enough letters'
  if (secret) return isSecretWord(w) ? '' : 'Pick a more everyday word'
  if (isGuessWord(w)) return ''
  return dictionaryReady() ? 'Not in the word list' : 'Not in the word list (yet: the full list is still loading)'
}

/* ── The secret word, kept on its owner's device only ───────────────── */

export interface Secret {
  word: string
  salt: string
}
// sessionStorage: survives a refresh mid-game, never leaves this tab
const secretKey = (id: string) => `lvs_bw:${id}`
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

/* ── Typing a word: on-screen keys, or a real keyboard ──────────────── */

export function useTyping(enabled: boolean, onEnter: (w: string) => void) {
  const [word, setWord] = useState('')
  const key = (k: string) => {
    if (!enabled) return
    if (k === 'ENTER') return onEnter(word)
    if (k === 'BACK') return setWord((w) => w.slice(0, -1))
    if (/^[A-Z]$/.test(k)) setWord((w) => (w.length < LEN ? w + k : w))
  }
  const keyRef = useRef(key)
  keyRef.current = key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea')) return
      const k = e.key === 'Enter' ? 'ENTER' : e.key === 'Backspace' ? 'BACK' : e.key.length === 1 ? e.key.toUpperCase() : ''
      if (!k) return
      if (k === 'ENTER' || k === 'BACK' || /^[A-Z]$/.test(k)) {
        e.preventDefault()
        keyRef.current(k)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return { word, setWord, key }
}

/* ── A board: six rows of five ──────────────────────────────────────── */

const MARK = { '2': 'hit', '1': 'near', '0': 'miss' } as const

/**
 * One player's guesses. `typing` fills the next row while it's their turn; `pending` shows a guess
 * waiting for its colours. `letters: false` shows colours only (online, their guesses at your word).
 * Each new answered row flips in, tile by tile.
 */
export function Grid({
  guesses,
  typing,
  pending,
  letters = true,
  shake = 0,
  small,
  label,
}: {
  guesses: Guess[]
  typing?: string
  pending?: string
  letters?: boolean
  /** bump to shake the typing row (a word that isn't accepted) */
  shake?: number
  small?: boolean
  label?: string
}) {
  // rows already on screen don't flip again
  const seen = useRef(guesses.length)
  const [fresh, setFresh] = useState(-1)
  useEffect(() => {
    if (guesses.length > seen.current) setFresh(guesses.length - 1)
    seen.current = guesses.length
  }, [guesses.length])

  const rows = Array.from({ length: MAX_GUESSES }, (_, r) => {
    const g = guesses[r]
    if (g) return { w: g.w, p: g.p, kind: 'done' as const }
    if (r === guesses.length && pending) return { w: pending, p: '', kind: 'pending' as const }
    if (r === guesses.length && typing !== undefined) return { w: typing, p: '', kind: 'typing' as const }
    return { w: '', p: '', kind: 'empty' as const }
  })

  return (
    <div className={`bw-grid${small ? ' bw-grid--small' : ''}`} role="grid" aria-label={label}>
      {rows.map((row, r) => (
        <div
          key={r}
          role="row"
          className={`bw-row bw-row--${row.kind}${row.kind === 'typing' && shake ? ` bw-shake-${shake % 2}` : ''}${row.p === SOLVED ? ' bw-row--won' : ''}${r === fresh ? ' bw-row--fresh' : ''}`}
        >
          {Array.from({ length: LEN }, (_, i) => {
            const c = row.w[i] ?? ''
            const p = row.p[i] as keyof typeof MARK | undefined
            return (
              <span
                key={i}
                role="gridcell"
                className={`bw-tile${p ? ` bw-tile--${MARK[p]}` : ''}${c && !p ? ' bw-tile--filled' : ''}`}
                style={{ '--i': i } as CSSProperties}
                aria-label={p ? `${letters ? c : 'letter'} ${MARK[p] === 'hit' ? 'right spot' : MARK[p] === 'near' ? 'in the word' : 'not in the word'}` : c || 'empty'}
              >
                {letters || !p ? c : ''}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ── Keyboard ─────────────────────────────────────────────────────────── */

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<']

/** Letters coloured by what your guesses have shown; Enter bottom left, ⌫ bottom right. */
export function Keys({ states, enabled, onKey }: { states: Record<string, '2' | '1' | '0'>; enabled: boolean; onKey: (k: string) => void }) {
  return (
    <div className={`bw-keys${enabled ? '' : ' bw-keys--off'}`} role="group" aria-label="Keyboard">
      {ROWS.map((row) => (
        <div key={row} className="bw-keys__row">
          {row.split('').map((l) => {
            if (l === '>')
              return (
                <button key={l} type="button" className="bw-key bw-key--wide" disabled={!enabled} onClick={() => onKey('ENTER')}>
                  Enter
                </button>
              )
            if (l === '<')
              return (
                <button key={l} type="button" className="bw-key bw-key--wide" disabled={!enabled} onClick={() => onKey('BACK')} aria-label="Delete">
                  ⌫
                </button>
              )
            const s = states[l]
            return (
              <button key={l} type="button" className={`bw-key${s ? ` bw-key--${MARK[s]}` : ''}`} disabled={!enabled} onClick={() => onKey(l)}>
                {l}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ── Picking your word ────────────────────────────────────────────────── */

/**
 * Type it on the keys (or tap Random), then lock it in. `hide`: the other player is in the room
 * (pass & play), so the letters show as dots unless you peek.
 */
export function WordSetter({ hide, forName, onLock }: { hide: boolean; forName: string; onLock: (word: string) => void }) {
  const [peek, setPeek] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const submit = (w: string) => {
    const why = problem(w, true)
    if (why) {
      setError(why)
      setShake((n) => n + 1)
      return
    }
    setBusy(true)
    onLock(w)
  }
  const { word, setWord, key } = useTyping(!busy, submit)
  // a new letter clears the last complaint
  useEffect(() => setError(''), [word])
  const masked = hide && !peek

  return (
    <div className="bw-set">
      <p className="bw-set__lead">
        Hide a word for <strong>{forName}</strong> to crack. Only the colours of their guesses come back.
      </p>
      <div className={`bw-set__word${shake ? ` bw-shake-${shake % 2}` : ''}`} aria-label={masked ? `${word.length} letters typed` : `Your word: ${word}`}>
        {Array.from({ length: LEN }, (_, i) => (
          <span key={i} className={`bw-tile${word[i] ? ' bw-tile--filled' : ''}`}>
            {word[i] ? (masked ? '•' : word[i]) : ''}
          </span>
        ))}
      </div>
      <div className="bw-set__tools">
        <button type="button" className="btn" onClick={() => setWord(randomWord())} disabled={busy}>
          ↻ Random
        </button>
        {hide && (
          <button type="button" className="btn" onClick={() => setPeek((v) => !v)} aria-pressed={peek}>
            {peek ? 'Hide' : 'Peek'}
          </button>
        )}
      </div>
      <p className="bw-msg" role="alert">
        {error}
      </p>
      <Keys
        states={{}}
        enabled={!busy}
        onKey={key}
      />
      <button type="button" className="btn btn--primary btn--lg bw-set__lock" disabled={busy || word.length < LEN} onClick={() => submit(word)}>
        Lock it in <span className="keycap">↵</span>
      </button>
    </div>
  )
}
