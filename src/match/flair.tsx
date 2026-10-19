import { createContext, useContext, useSyncExternalStore } from 'react'
import { load, save } from '../lib/storage'

/*
 * Wins and Flair, from the shop. Looks only.
 *  - Wins: what plays on your screen when you win a match, in place of the confetti (Confetti.tsx).
 *    Picked on this device, like what you throw.
 *  - Flair: on your score card in every match, for everyone to see: a frame round it, a title over it,
 *    your name in gold. One of each at a time. Picked on this device and sent with your room entry as
 *    `flair` ("fkente,tchair,goldname"), so the other phones draw it.
 */

/* ── Wins ── */

export type WinId = 'chiprain' | 'akwaaba' | 'fireworks' | 'banner'
export const WINS: { id: WinId; name: string; price: number; blurb: string }[] = [
  { id: 'chiprain', name: 'Gold chip rain', price: 300, blurb: 'Casino chips pour down the screen, clacking as they land.' },
  { id: 'akwaaba', name: 'Red, gold and green', price: 400, blurb: 'Ghana’s colours stream down round the black star, to the talking drums.' },
  { id: 'fireworks', name: 'Fireworks', price: 450, blurb: 'Rockets go up and burst over the results.' },
  { id: 'banner', name: 'Champion banner', price: 600, blurb: 'A banner with your name drops in, with a trumpet blast.' },
]
const isWin = (v: unknown): v is WinId => WINS.some((w) => w.id === v)

const WIN_KEY = 'lvs_win'
const FLAIR_KEY = 'lvs_flair'
const listeners = new Set<() => void>()
const subscribe = (f: () => void) => {
  listeners.add(f)
  window.addEventListener('storage', f)
  return () => {
    listeners.delete(f)
    window.removeEventListener('storage', f)
  }
}
const changed = () => listeners.forEach((f) => f())

const readWin = (): WinId | null => {
  const v = load(WIN_KEY)
  return isWin(v) ? v : null
}
/** what plays when you win, on this device (null: the confetti everyone has) */
export const useWinPick = () => useSyncExternalStore(subscribe, readWin, () => null)
export function setWinPick(id: WinId | null) {
  save(WIN_KEY, id)
  changed()
}

/* ── Flair ── */

export type FlairKind = 'frame' | 'title' | 'gold'
export interface FlairItem {
  id: string
  kind: FlairKind
  name: string
  price: number
  blurb: string
  /** a title's words */
  title?: string
}
export const FLAIR: FlairItem[] = [
  { id: 'fkente', kind: 'frame', name: 'Kente frame', price: 150, blurb: 'Gold, green and red woven round your card.' },
  { id: 'fflag', kind: 'frame', name: 'Black Stars frame', price: 150, blurb: 'Red, gold and green bands round your card.' },
  { id: 'fneon', kind: 'frame', name: 'Neon frame', price: 150, blurb: 'A glowing ring that keeps changing colour.' },
  { id: 'tchair', kind: 'title', name: 'The Chairman', title: 'The Chairman', price: 300, blurb: 'Over your card, in every match.' },
  { id: 'todogwu', kind: 'title', name: 'Odogwu', title: 'Odogwu', price: 300, blurb: 'Over your card, in every match.' },
  { id: 'tmenace', kind: 'title', name: 'Ludo Menace', title: 'Ludo Menace', price: 300, blurb: 'Over your card, in every match.' },
  { id: 'tboss', kind: 'title', name: 'Spar Boss', title: 'Spar Boss', price: 300, blurb: 'Over your card, in every match.' },
  { id: 'twizard', kind: 'title', name: 'Word Wizard', title: 'Word Wizard', price: 300, blurb: 'Over your card, in every match.' },
  { id: 'tnomercy', kind: 'title', name: 'No Mercy', title: 'No Mercy', price: 300, blurb: 'Over your card, in every match.' },
  { id: 'goldname', kind: 'gold', name: 'Name in gold', price: 500, blurb: 'Your name in shining gold on your card.' },
]
export const flairOf = (id: string) => FLAIR.find((f) => f.id === id)

/** what a card wears: one of each kind at most */
export interface Flair {
  frame?: string
  title?: string
  gold?: boolean
}
/** a sent or stored list ("fkente,tchair,goldname") as flair we still draw, one of each kind */
export function asFlair(v: unknown): Flair {
  const out: Flair = {}
  for (const id of typeof v === 'string' ? v.split(',') : []) {
    const f = flairOf(id)
    if (!f) continue
    if (f.kind === 'frame') out.frame ??= f.id
    else if (f.kind === 'title') out.title ??= f.title
    else out.gold = true
  }
  return out
}

const readFlairIds = () => (load(FLAIR_KEY) ?? '').split(',').filter((id) => flairOf(id))
let cache = { raw: '', ids: [] as string[] }
const readFlair = () => {
  const raw = load(FLAIR_KEY) ?? ''
  if (raw !== cache.raw) cache = { raw, ids: readFlairIds() }
  return cache.ids
}
/** the flair this device has on, as ids */
export const useMyFlair = () => useSyncExternalStore(subscribe, readFlair, () => cache.ids)
/** as sent with a room entry ('' for none) */
export const myFlairString = () => readFlair().join(',')
/** put something on (taking off whatever else of its kind), or take it off */
export function setFlairOn(id: string, on: boolean) {
  const f = flairOf(id)
  if (!f) return
  const rest = readFlair().filter((x) => flairOf(x)!.kind !== f.kind)
  save(FLAIR_KEY, (on ? [...rest, id] : rest).join(',') || null)
  changed()
}

/** flair for players whose entry doesn't carry it (you, against Ops): id → flair string */
const FlairsContext = createContext<Record<string, string>>({})
export const FlairsProvider = FlairsContext.Provider
/** what a player's card wears */
export function usePlayerFlair(p: { id: string; flair?: string } | null): Flair {
  const fixed = useContext(FlairsContext)
  return asFlair(p ? (fixed[p.id] ?? p.flair) : undefined)
}
