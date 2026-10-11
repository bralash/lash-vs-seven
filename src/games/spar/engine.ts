import { CARDS, DECK_SIZE, HAND } from './deal'

/**
 * Spar, two to four players. 35 cards (6 to Ace in four suits, without the Ace of Spades), five each, the leader plays first and
 * then the rest in any order, follow suit if you can, no trumps: the highest card of the led suit takes the trick. Only the
 * last trick scores: 1 point, or 3 if it's won with a 6 and 2 with a 7. Win the last two tricks with
 * 6s/7s and both count (6 + 7 = 5, 6 + 6 = 6, 7 + 7 = 4). First to the target wins.
 *
 * Seats are the room's (0–3); `seats` lists who's still playing. Someone leaving mid-round can't be
 * played around — their key locks every card — so the round is dealt again without them (`drop`).
 *
 * Drop all: on your own lead with two or more cards left you can lay them all down and claim every
 * trick still to come. If nobody could take one of them off you, you win the round as the best order of
 * your cards would score. If somebody could, that's Gba: you lose 3 points and sit out the rest of the
 * round (with just one player left, they take it for 1). Online each other phone checks its own hand.
 *
 * Online, the hands never enter the room — see deal.ts. The room holds the deck as the phones lock it,
 * the dealt cards as they unlock them, and the cards played. On one device the hands sit in `hands`.
 */
export const TRICKS = HAND
export const TARGETS = [5, 10, 15] as const

/** Cards are numbers 0–35: suit = k ÷ 9, rank = k mod 9 (0 is the 6, 8 the Ace). 8, the Ace of Spades, isn't dealt. */
export const suitOf = (k: number) => Math.floor(k / 9)
export const rankOf = (k: number) => k % 9
export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const rankLabel = (k: number) => RANKS[rankOf(k)]
export const cardLabel = (k: number) => `${rankLabel(k)}${SUITS[suitOf(k)]}`
export const isRed = (k: number) => suitOf(k) === 1 || suitOf(k) === 2

/** What a card is worth if it wins the last trick: dry 6 = 3, 7 = 2, otherwise 0 (a plain 1-point finish). */
const bonus = (k: number) => (rankOf(k) === 0 ? 3 : rankOf(k) === 1 ? 2 : 0)

export interface Play {
  s: number
  c: number
  /** played for someone sitting out after a Gba: it follows the trick round but can't take it */
  x?: 1
}

/** A drop all in the round: who, their cards, and how many cards had been played when they dropped. */
export interface Drop {
  s: number
  cards: number[]
  at: number
}

export interface Round {
  /** leads the first trick, and is the last phone in the deal's chain */
  leader: number
  /** who's dealt in, in seat order (missing on rounds from before 3–4 players: seats 0 and 1) */
  seats?: number[]
  /** the deck as the last phone in the chain locked and shuffled it, and how many have */
  deck?: string[]
  locked?: number
  /** five cards per player in seat order, as the phones take their locks off the others' */
  dealt?: string[]
  stripped?: number
  /** pass & play only: every hand, by seat, on this device */
  hands?: number[][]
  plays?: Play[]
  /** revealed once the round is over (`s0`…`s3`), so every phone can check the deal */
  keys?: Record<string, string>
  winner?: number
  points?: number
  /** forfeit: a player's key was lost on their device, so they couldn't see or play their hand */
  forfeitBy?: number
  /** a drop all waiting on the other phones' checks, or the one that won the round */
  drop?: Drop
  /** each other phone's answer to the drop (`s0`…): -1 can't take a trick, otherwise the card that can */
  checks?: Record<string, number>
  /** Gbas this round: the drop, who caught it and with what */
  gba?: (Drop & { by: number; c: number })[]
  /** seats sitting out after a Gba, with the cards they laid down (played for them, face up) */
  out?: Record<string, number[]>
}

/** One finished round, kept for the results. */
export interface Past {
  winner: number
  points: number
  /** the winner's scoring cards (the last trick, or the last two when they add up) */
  cards?: number[]
  forfeit?: boolean
  /** the winner took every trick of the round (a feat; missing on rounds from before feats) */
  sweep?: boolean
  /** the winner dropped all */
  drop?: boolean
  /** one-on-one: the other player was caught dropping (Gba), so the winner took the round */
  gba?: number
}

export interface Live {
  target: number
  /** rounds played to a finish so far (the one on now is round + 1) */
  round: number
  /** deals so far, counting rounds dealt again — each deal gets fresh keys */
  deal?: number
  /** deal: the phones are shuffling; play; done: this round is over */
  phase: 'deal' | 'play' | 'done'
  /** whose move it is (during the deal: whose phone has to act next) */
  turn: number
  /** by seat */
  scores: number[]
  /** who's still playing, in seat order (missing on matches from before 3–4 players: 0 and 1) */
  seats?: number[]
  cur: Round
  /** (the database drops empty arrays — read as `past ?? []`) */
  past?: Past[]
  /** the round on now was dealt again: who for, and why */
  redeal?: { who: number; why: 'left' | 'forfeit' }
}

export const sk = (s: number) => `s${s}`
export const seatsOf = (live: Live) => live.seats ?? [0, 1]
/** who was dealt into the round on now */
export const roundSeats = (live: Live) => live.cur.seats ?? seatsOf(live)
export const dealNo = (live: Live) => live.deal ?? live.round

/** the next seat round the table after `s` (which may itself have just left) */
export function nextSeat(seats: number[], s: number): number {
  return seats.find((x) => x > s) ?? seats[0]
}

/** The deal's chain: starts after the leader and ends with them. */
export function chainOf(live: Live): number[] {
  const seats = roundSeats(live)
  const i = seats.indexOf(live.cur.leader)
  return [...seats.slice(i + 1), ...seats.slice(0, i + 1)]
}

function newRound(live: Live, seats: number[], leader: number): Live {
  const next: Live = { ...live, seats, phase: 'deal', deal: dealNo(live) + 1, cur: { leader, seats } }
  delete next.redeal
  return { ...next, turn: chainOf(next)[0] }
}

export function freshLive(target: number, seats: number[], leader: number): Live {
  const scores = Array.from({ length: Math.max(...seats) + 1 }, () => 0)
  const live: Live = { target, round: 0, deal: 0, phase: 'deal', turn: 0, scores, seats, cur: { leader, seats } }
  return { ...live, turn: chainOf(live)[0] }
}

/* ── The deal (online) ──────────────────────────────────────────────── */

/** A phone locks and shuffles the deck, in its turn round the chain. After the last, the cards are dealt. */
export function postLock(live: Live, seat: number, deck: string[]): Live | undefined {
  const r = live.cur
  const chain = chainOf(live)
  const locked = r.locked ?? 0
  if (live.phase !== 'deal' || r.dealt || chain[locked] !== seat || deck?.length !== (r.deck?.length ?? DECK_SIZE)) return undefined
  if (locked + 1 < chain.length) return { ...live, cur: { ...r, deck, locked: locked + 1 }, turn: chain[locked + 1] }
  return { ...live, cur: { ...r, deck, locked: locked + 1, dealt: deck.slice(0, HAND * chain.length), stripped: 0 }, turn: chain[0] }
}

/** A phone takes its lock off everyone else's cards, in its turn. After the last, play starts. */
export function postStrip(live: Live, seat: number, dealt: string[]): Live | undefined {
  const r = live.cur
  const chain = chainOf(live)
  const stripped = r.stripped ?? 0
  if (live.phase !== 'deal' || !r.dealt || chain[stripped] !== seat || dealt?.length !== r.dealt.length) return undefined
  if (stripped + 1 < chain.length) return { ...live, cur: { ...r, dealt, stripped: stripped + 1 }, turn: chain[stripped + 1] }
  return { ...live, cur: { ...r, dealt, stripped: stripped + 1 }, phase: 'play', turn: r.leader }
}

/** The deal is done: everyone's cards have only their owner's lock left. */
export const dealt = (live: Live) => !!live.cur.dealt && (live.cur.stripped ?? 0) >= roundSeats(live).length

/** Pass & play: one phone deals every hand in the open. */
export function dealLocal(live: Live, hands: number[][]): Live | undefined {
  if (live.phase !== 'deal') return undefined
  return { ...live, cur: { ...live.cur, hands }, phase: 'play', turn: live.cur.leader }
}

/** Five cards for each of `seats`, by seat (other seats get none). */
export function shuffledHands(seats: number[]): number[][] {
  const deck = [...CARDS]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const hands: number[][] = Array.from({ length: Math.max(...seats) + 1 }, () => [])
  seats.forEach((s, i) => (hands[s] = deck.slice(i * HAND, (i + 1) * HAND).sort(byCard)))
  return hands
}

/** sorting a hand: by suit, then rank */
export const byCard = (a: number, b: number) => a - b

/* ── Play ───────────────────────────────────────────────────────────── */

export const playsOf = (r: Round) => r.plays ?? []

/** Trick `t` of a round with `n` players: its lead and the cards played to it so far. */
export function trickAt(plays: Play[], t: number, n: number): Play[] {
  return plays.slice(t * n, t * n + n)
}

/** The highest card of the led suit takes it (a card played for someone sitting out can't). */
export function trickWinner(trick: Play[]): number {
  const live = trick.filter((p) => !p.x)
  let best = live[0] ?? trick[0]
  for (const p of live) if (suitOf(p.c) === suitOf(best.c) && rankOf(p.c) > rankOf(best.c)) best = p
  return best.s
}

/** Seats sitting out the round after a Gba. */
export const outOf = (r: Round) => Object.keys(r.out ?? {}).map((k) => Number(k.slice(1)))

/** Which cards of `hand` can be played now: anything when leading, otherwise the led suit if you have it. */
export function playable(hand: number[], plays: Play[], n: number): number[] {
  if (plays.length % n === 0) return hand
  const led = suitOf(plays[plays.length - (plays.length % n)].c)
  const follow = hand.filter((c) => suitOf(c) === led)
  return follow.length ? follow : hand
}

/** What's left in a seat's hand, given the five dealt. */
export const remaining = (hand: number[], plays: Play[], seat: number) => hand.filter((c) => !plays.some((p) => p.s === seat && p.c === c))

/** Seats that haven't played to the trick in progress yet (none of them, while it's still to be led). */
function stillToPlay(seats: number[], plays: Play[], n: number): number[] {
  const trick = plays.slice(plays.length - (plays.length % n))
  return seats.filter((s) => !trick.some((p) => p.s === s))
}

/** Who may play now: the leader to start a trick, then anyone who hasn't played to it yet, in any order. */
export function toPlay(live: Live): number[] {
  if (live.phase !== 'play' || live.cur.drop) return []
  const plays = playsOf(live.cur)
  const seats = roundSeats(live)
  const out = outOf(live.cur)
  return plays.length % seats.length === 0 ? [live.turn] : stillToPlay(seats, plays, seats.length).filter((s) => !out.includes(s))
}

/** Pass & play: hand the phone to any player still to play this trick. */
export function handTo(live: Live, seat: number): Live | undefined {
  if (!toPlay(live).includes(seat) || live.turn === seat) return undefined
  return { ...live, turn: seat }
}

/**
 * Play a card. `hand` is the player's own dealt hand when this device knows it; online the other
 * phones can't check it, so that waits for the end-of-round check.
 */
export function play(live: Live, seat: number, card: number, hand?: number[]): Live | undefined {
  const r = live.cur
  const plays = playsOf(r)
  const seats = roundSeats(live)
  const n = seats.length
  if (live.phase !== 'play' || !toPlay(live).includes(seat) || !Number.isInteger(card) || card < 0 || card > 35) return undefined
  if (plays.some((p) => p.c === card)) return undefined
  if (hand && !playable(remaining(hand, plays, seat), plays, n).includes(card)) return undefined
  const next: Play[] = [...plays, { s: seat, c: card }]
  // everyone still in has played to the trick: the cards of anyone sitting out follow, face up
  const out = outOf(r)
  if (out.length && next.length % n && stillToPlay(seats, next, n).every((s) => out.includes(s))) {
    for (const o of stillToPlay(seats, next, n)) {
      const left = r.out![sk(o)].filter((c) => !next.some((p) => p.c === c))
      next.push({ s: o, c: left[0], x: 1 })
    }
  }
  const cur = { ...r, plays: next }
  // after the lead anyone still to play can go; `turn` just suggests who (the next round the table)
  if (next.length % n !== 0) return { ...live, cur, turn: nextSeat(stillToPlay(seats, next, n), seat) }
  const won = trickWinner(next.slice(-n))
  if (next.length < TRICKS * n) return { ...live, cur, turn: won }
  return finish({ ...live, cur })
}

/** Points for the round: the last trick's winner scores. */
export function scoreRound(plays: Play[], n: number): { winner: number; points: number; cards: number[] } {
  const last = trickAt(plays, TRICKS - 1, n)
  const w = trickWinner(last)
  const c5 = last.find((p) => p.s === w)!.c
  if (!bonus(c5)) return { winner: w, points: 1, cards: [c5] }
  const fourth = trickAt(plays, TRICKS - 2, n)
  const c4 = fourth.find((p) => p.s === w)!.c
  if (trickWinner(fourth) === w && bonus(c4)) return { winner: w, points: bonus(c4) + bonus(c5), cards: [c4, c5] }
  return { winner: w, points: bonus(c5), cards: [c5] }
}

function finish(live: Live): Live {
  const plays = playsOf(live.cur)
  const n = roundSeats(live).length
  const { winner, points, cards } = scoreRound(plays, n)
  const sweep = Array.from({ length: TRICKS }, (_, t) => trickWinner(trickAt(plays, t, n))).every((w) => w === winner)
  const scores = [...live.scores]
  scores[winner] += points
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...live.cur, winner, points },
    past: [...(live.past ?? []), { winner, points, cards, ...(sweep ? { sweep } : {}) }],
  }
}

/**
 * A player's key is gone (the page was opened on another device), so they can't see their cards.
 * One-on-one, they give up the round and the other player scores 1. With three or four, the round
 * is dealt again and it costs them a point (if they have one).
 */
export function forfeit(live: Live, seat: number): Live | undefined {
  const seats = roundSeats(live)
  if (live.phase === 'done' || !seats.includes(seat)) return undefined
  const scores = [...live.scores]
  if (seats.length > 2) {
    scores[seat] = Math.max(0, scores[seat] - 1)
    return { ...newRound({ ...live, scores }, seatsOf(live), live.cur.leader), redeal: { who: seat, why: 'forfeit' } }
  }
  const winner = seats.find((s) => s !== seat)!
  scores[winner] += 1
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...live.cur, winner, points: 1, forfeitBy: seat },
    past: [...(live.past ?? []), { winner, points: 1, forfeit: true }],
  }
}

/**
 * A player has left the match. Their score stays on the board, but they're out: a round in progress
 * is dealt again for the rest (with the next player leading if it was theirs to lead).
 */
export function drop(live: Live, seat: number): Live | undefined {
  const seats = seatsOf(live)
  if (!seats.includes(seat)) return undefined
  const rest = seats.filter((s) => s !== seat)
  if (live.phase === 'done' || rest.length < 2) return { ...live, seats: rest }
  const leader = rest.includes(live.cur.leader) ? live.cur.leader : nextSeat(rest, live.cur.leader)
  return { ...newRound(live, rest, leader), redeal: { who: seat, why: 'left' } }
}

/** After the round: the key goes public so the other phones can check everything. */
export function revealKey(live: Live, seat: number, key: string): Live | undefined {
  if (live.phase !== 'done' || live.cur.keys?.[sk(seat)]) return undefined
  return { ...live, cur: { ...live.cur, keys: { ...live.cur.keys, [sk(seat)]: key } } }
}

export const matchOver = (live: Live) => live.phase === 'done' && Math.max(...live.scores) >= live.target

/** The match's winner (by seat), or -1 while level at the top. */
export function leaderOf(scores: number[], seats: number[]): number {
  const top = Math.max(...seats.map((s) => scores[s]))
  const at = seats.filter((s) => scores[s] === top)
  return at.length === 1 ? at[0] : -1
}

/** Next round: whoever took the last one leads (or, if they've left, the next player round). */
export function nextRound(live: Live): Live | undefined {
  if (live.phase !== 'done' || matchOver(live) || live.cur.winner === undefined) return undefined
  const seats = seatsOf(live)
  const leader = seats.includes(live.cur.winner) ? live.cur.winner : nextSeat(seats, live.cur.winner)
  return newRound({ ...live, round: live.round + 1 }, seats, leader)
}

/* ── The end-of-round check ─────────────────────────────────────────── */

/**
 * With every hand known (by seat): was every card played really in that hand, and did each player
 * follow suit whenever they could?
 */
export function checkPlays(plays: Play[], hands: number[][], n: number): { s: number; why: string } | null {
  for (let i = 0; i < plays.length; i++) {
    const { s, c } = plays[i]
    const before = plays.slice(0, i)
    const left = remaining(hands[s] ?? [], before, s)
    if (!left.includes(c)) return { s, why: `played ${cardLabel(c)}, which wasn’t in their hand` }
    if (!plays[i].x && !playable(left, before, n).includes(c)) return { s, why: `didn’t follow suit with ${cardLabel(c)}` }
  }
  return null
}

/** How the round was scored, for the round-over line. */
export function finishLabel(p: Past): string {
  if (p.forfeit) return 'forfeit'
  if (p.gba !== undefined) return 'Gba'
  if (p.drop) {
    const how = finishLabel({ ...p, drop: false })
    return how === 'last trick' ? 'drop all' : `drop all · ${how}`
  }
  const cs = p.cards ?? []
  if (cs.length === 2) return `${cs.map(rankLabel).join(' + ')} double`
  const c = cs[0]
  if (c === undefined) return ''
  return rankOf(c) === 0 ? 'dry 6' : rankOf(c) === 1 ? 'with a 7' : 'last trick'
}

/* ── Drop all, and Gba ──────────────────────────────────────────────── */

/** Fewest cards you can drop: with one left it's just the last trick. */
export const DROP_MIN = 2

/** Can `seat` drop all now? `left`: how many cards they still hold. */
export function canDrop(live: Live, seat: number, left: number): boolean {
  const r = live.cur
  const n = roundSeats(live).length
  return live.phase === 'play' && !r.drop && playsOf(r).length % n === 0 && live.turn === seat && !outOf(r).includes(seat) && left >= DROP_MIN
}

/**
 * A card in `hand` that would take a trick off a drop of `cards`, or null. The drop is played at its
 * best: each suit from the top down, so a high card can draw out the cards that would beat a lower
 * one. You can only lose a trick in a suit you hold, and `hand` keeps its top card of that suit to the
 * k-th lead of it if it has at least k cards of it to follow with — so it takes a trick if that top
 * card beats the k-th highest dropped card for some k up to how many it holds.
 */
export function catcher(cards: number[], hand: number[]): number | null {
  for (const suit of new Set(cards.map(suitOf))) {
    const d = cards.filter((c) => suitOf(c) === suit).sort((a, b) => b - a)
    const x = hand.filter((c) => suitOf(c) === suit).sort((a, b) => b - a)
    const k = Math.min(d.length, x.length)
    if (k && x[0] > d[k - 1]) return x[0]
  }
  return null
}

/**
 * The order to lay a drop out in: the best score among orders that lead each suit from the top down
 * (the 6/7 bonus only looks at the last two cards). Returns the order and what it scores.
 */
export function dropOrder(cards: number[]): { order: number[]; points: number; scoring: number[] } {
  let best = { order: [...cards].sort((a, b) => b - a), points: 0, scoring: [] as number[] }
  const go = (done: number[], rest: number[]) => {
    if (!rest.length) {
      const c5 = done[done.length - 1]
      const c4 = done[done.length - 2]
      const both = bonus(c5) && c4 !== undefined && bonus(c4)
      const points = !bonus(c5) ? 1 : both ? bonus(c4) + bonus(c5) : bonus(c5)
      if (points > best.points) best = { order: done, points, scoring: both ? [c4, c5] : [c5] }
      return
    }
    for (const c of rest) {
      // within a suit, from the top down
      if (rest.some((o) => suitOf(o) === suitOf(c) && o > c)) continue
      go([...done, c], rest.filter((o) => o !== c))
    }
  }
  go([], cards)
  return best
}

/** Everyone in the round who's still playing it. */
const inRound = (live: Live) => roundSeats(live).filter((s) => !outOf(live.cur).includes(s))

/**
 * Drop all. `hand`: the dropper's dealt hand when this device knows it. `others`: on one device, every
 * other player's dealt hand by seat, so the drop is settled at once; online it waits for each phone's check.
 */
export function dropAll(live: Live, seat: number, cards: number[], hand?: number[], others?: number[][]): Live | undefined {
  const r = live.cur
  const plays = playsOf(r)
  const tricksLeft = TRICKS - Math.floor(plays.length / roundSeats(live).length)
  if (!canDrop(live, seat, cards?.length ?? 0) || cards.length !== tricksLeft || new Set(cards).size !== cards.length) return undefined
  if (cards.some((c) => !Number.isInteger(c) || c < 0 || c > 35 || plays.some((p) => p.c === c))) return undefined
  if (hand && remaining(hand, plays, seat).sort(byCard).join() !== [...cards].sort(byCard).join()) return undefined
  const next: Live = { ...live, cur: { ...r, drop: { s: seat, cards, at: plays.length }, checks: {} } }
  if (!others) return next
  for (const o of inRound(live)) {
    if (o === seat) continue
    const c = catcher(cards, remaining(others[o] ?? [], plays, o))
    if (c !== null) return gba(next, o, c)
  }
  return winDrop(next)
}

/** Online: another phone's check of the drop. `card`: -1 if it can't take a trick, otherwise the card that can. */
export function postCheck(live: Live, seat: number, card: number): Live | undefined {
  const r = live.cur
  const d = r.drop
  if (live.phase !== 'play' || !d || seat === d.s || !inRound(live).includes(seat) || r.checks?.[sk(seat)] !== undefined) return undefined
  if (card !== -1 && (!Number.isInteger(card) || card < 0 || card > 35 || d.cards.includes(card) || playsOf(r).some((p) => p.c === card))) return undefined
  if (card !== -1) return gba(live, seat, card)
  const checks = { ...r.checks, [sk(seat)]: -1 }
  const next: Live = { ...live, cur: { ...r, checks } }
  return inRound(live).every((s) => s === d.s || checks[sk(s)] !== undefined) ? winDrop(next) : next
}

/** Nobody could stop it: the dropper takes every trick left, scored as the best order of their cards. */
function winDrop(live: Live): Live {
  const r = live.cur
  const d = r.drop!
  const plays = playsOf(r)
  const n = roundSeats(live).length
  const { points, scoring, order } = dropOrder(d.cards)
  const sweep = Array.from({ length: Math.floor(plays.length / n) }, (_, t) => trickWinner(trickAt(plays, t, n))).every((w) => w === d.s)
  const scores = [...live.scores]
  scores[d.s] += points
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...r, drop: { ...d, cards: order }, winner: d.s, points },
    past: [...(live.past ?? []), { winner: d.s, points, cards: scoring, drop: true, ...(sweep ? { sweep } : {}) }],
  }
}

/** Caught: the dropper loses 3 (not below 0) and sits the rest of the round out. One player left takes it for 1. */
function gba(live: Live, by: number, c: number): Live {
  const r = live.cur
  const d = r.drop!
  const scores = [...live.scores]
  scores[d.s] = Math.max(0, scores[d.s] - 3)
  const cur: Round = { ...r, gba: [...(r.gba ?? []), { ...d, by, c }], out: { ...r.out, [sk(d.s)]: d.cards } }
  delete cur.drop
  delete cur.checks
  const left = inRound({ ...live, cur })
  if (left.length > 1) return { ...live, scores, cur, turn: nextSeat(left, d.s) }
  const winner = left[0]
  scores[winner] += 1
  return {
    ...live,
    phase: 'done',
    scores,
    cur: { ...cur, winner, points: 1 },
    past: [...(live.past ?? []), { winner, points: 1, gba: d.s }],
  }
}

/**
 * The end-of-round check for drops, with every hand known: each drop was the dropper's whole hand,
 * every Gba was called with a card that really takes a trick, and nobody let a catchable drop through.
 */
export function checkDrops(r: Round, hands: number[][]): { s: number; why: string } | null {
  const plays = playsOf(r)
  const held = (s: number, at: number) => remaining(hands[s] ?? [], plays.slice(0, at), s).sort(byCard).join()
  for (const g of r.gba ?? []) {
    if (held(g.s, g.at) !== [...g.cards].sort(byCard).join()) return { s: g.s, why: 'dropped cards that weren’t their hand' }
    const theirs = remaining(hands[g.by] ?? [], plays.slice(0, g.at), g.by)
    if (!theirs.includes(g.c) || catcher(g.cards, theirs) === null) return { s: g.by, why: `called Gba with ${cardLabel(g.c)}, which couldn’t take a trick` }
  }
  const d = r.drop
  if (d && r.winner === d.s) {
    if (held(d.s, d.at) !== [...d.cards].sort(byCard).join()) return { s: d.s, why: 'dropped cards that weren’t their hand' }
    for (const k of Object.keys(r.checks ?? {})) {
      const s = Number(k.slice(1))
      const c = catcher(d.cards, remaining(hands[s] ?? [], plays.slice(0, d.at), s))
      if (c !== null) return { s, why: `could have caught the drop with ${cardLabel(c)}` }
    }
  }
  return null
}
