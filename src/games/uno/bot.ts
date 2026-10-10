import { squash, type Brain, type Level, type OpsSense } from '../../match/bot'
import { callUno, catchUno, colourOf, countOf, draw, fits, isWild, keep, kindOf, numberOf, play, playable, playsOf, type Live } from './engine'

/**
 * Ops at Uno. She only ever reads her own hand and what's on the table: your card count, the pile.
 * Hard keeps her Wilds for when she needs them, hits you with draws and skips when you're close to
 * out, and names the colour she holds most of. Medium slips now and then; Easy plays any card that
 * fits. She calls Uno (Easy forgets now and then) and catches you when you forget.
 */

const OPS = 1
const YOU = 0

/** the match state's game (the vault next to it is only for online rooms) */
export const gameOf = (state: Record<string, unknown>) => (state.live as { g?: Live } | undefined)?.g

const CATCH: Record<Level, number> = { easy: 0.35, medium: 0.7, hard: 0.95 }
const FORGET: Record<Level, number> = { easy: 0.3, medium: 0.1, hard: 0.02 }
const SLIP: Record<Level, number> = { easy: 0.6, medium: 0.2, hard: 0 }

const pickOne = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** the colour she holds most of (ties at random) */
function bestColour(hand: number[]): number {
  const n = [0, 0, 0, 0]
  for (const c of hand) if (!isWild(c)) n[colourOf(c)]++
  const top = Math.max(...n)
  return pickOne([0, 1, 2, 3].filter((c) => n[c] === top))
}

function score(g: Live, c: number, hand: number[]): number {
  const you = countOf(g, YOU)
  const k = kindOf(c)
  let s: number
  if (k === 'wild4') s = you <= 2 ? 30 : -20
  else if (k === 'wild') s = you <= 1 ? 6 : -10
  else if (k === 'draw2') s = you <= 2 ? 20 : 4
  else if (k === 'skip' || k === 'reverse') s = you <= 2 ? 15 : 3
  else s = numberOf(c) / 3
  // keep the pile on a colour she has more of
  const rest = hand.filter((x) => x !== c)
  const col = isWild(c) ? bestColour(rest) : colourOf(c)
  return s + 2 * rest.filter((x) => colourOf(x) === col).length
}

const onGame = (act: (g: Live) => Live | undefined) => (w: { g: Live }) => {
  const g = act(w.g)
  return g ? { ...w, g } : undefined
}

export const unoBrain: Brain = (state, level) => {
  const g = gameOf(state)
  if (!g || g.phase !== 'play' || !g.hands) return null
  // you went down to one card without calling it
  if (g.uno === YOU && Math.random() < CATCH[level]) return onGame((l) => catchUno(l, OPS, YOU)) as never
  if (g.turn !== OPS) return null
  const hand = g.hands[OPS] ?? []
  if (g.drew === OPS) {
    const c = g.drawn as number
    if (!fits(g, c) || (level === 'easy' && Math.random() < 0.3)) return onGame((l) => keep(l, OPS)) as never
    return onGame((l) => play(l, OPS, c, { col: isWild(c) ? bestColour(hand.filter((x) => x !== c)) : undefined })) as never
  }
  const legal = playable(g, OPS, hand)
  if (!legal.length) return onGame((l) => draw(l, OPS)) as never
  const c = Math.random() < SLIP[level] ? pickOne(legal) : legal.reduce((a, b) => (score(g, b, hand) > score(g, a, hand) ? b : a))
  const col = isWild(c) ? (level === 'easy' && Math.random() < 0.4 ? Math.floor(Math.random() * 4) : bestColour(hand.filter((x) => x !== c))) : undefined
  const call = hand.length === 2 && Math.random() >= FORGET[level]
  return onGame((l) => play(call ? (callUno(l, OPS) ?? l) : l, OPS, c, { col })) as never
}

export const unoSense: OpsSense = {
  key: (st) => {
    const g = gameOf(st)
    return g ? `${st.match}:${g.deal}:${g.phase}:${playsOf(g).length}:${countOf(g, 0)}:${countOf(g, 1)}:${g.turn}:${g.uno ?? ''}` : ''
  },
  turn: (st) => {
    const g = gameOf(st)
    return g?.phase === 'play' ? (g.turn === OPS ? 1 : 0) : null
  },
  standing: (st) => {
    const g = gameOf(st)
    return g?.phase === 'play' ? squash(countOf(g, YOU) - countOf(g, OPS), 4) : null
  },
  ended: (st) => {
    const g = gameOf(st)
    return g?.phase === 'done' && g.winner !== undefined ? { winner: g.winner === OPS ? 1 : 0, final: true } : null
  },
  moment: (prev, next) => {
    const a = gameOf(prev)
    const b = gameOf(next)
    const l = b?.last
    if (!a || !b || !l || JSON.stringify(l) === JSON.stringify(a.last ?? null)) return null
    if (l.what === 'owe' && (l.n ?? 0) >= 4) return l.s === OPS ? { moment: 'unlucky', said: `+${l.n}?!` } : { moment: 'took', said: `Draw ${l.n}!` }
    if (l.what === 'catch') return l.by === OPS ? { moment: 'took', said: 'Caught you!' } : { moment: 'lost', said: 'Oops' }
    if (l.what === 'play' && l.s === OPS && countOf(b, OPS) === 1 && b.uno !== OPS) return { moment: 'lucky', said: 'Uno!' }
    return null
  },
}
