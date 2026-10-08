/**
 * The head-to-head record: you vs one person, all-time, kept on this device. Both players' devices
 * record the same finished matches, so their records agree without any shared storage.
 * See docs/rivalry-plan.md.
 */

export type Outcome = 'win' | 'loss' | 'draw'
export interface Tally {
  w: number
  l: number
  d: number
}
export interface Rival {
  /** the opponent's latest name (online) — pass & play keys carry both names instead */
  name: string
  total: Tally
  byGame: Record<string, Tally>
  /** current run of wins; draws end it */
  streak: { who: 'me' | 'them'; n: number } | null
  updatedAt: number
  /** the game you last played together (missing on records from before it was kept) */
  last?: string
  /** feats earned against each other, by feat id: how many matches each side earned it in */
  feats?: Record<string, FeatTally>
}
export interface FeatTally {
  me: number
  them: number
}
/**
 * The record of a group of three or four who play together: how many matches each has won. Kept
 * as one record for the whole group rather than a head-to-head with each of them.
 */
export interface Group {
  /** everyone in it (uid online, the name in lower case in pass & play) → their latest name */
  members: Record<string, string>
  /** online: which member is you (your uid), so lists can say "You" */
  you?: string
  played: number
  /** matches won, by member; a match level at the top is played but won by nobody */
  wins: Record<string, number>
  byGame: Record<string, { played: number; wins: Record<string, number> }>
  /** current run of wins by one member */
  streak: { who: string; n: number } | null
  updatedAt: number
  last?: string
}
interface Store {
  rivals: Record<string, Rival>
  groups: Record<string, Group>
  /** finished matches already counted, newest last */
  seen: string[]
}

const KEY = 'lvs_rivals'
const SEEN_MAX = 200

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const s = raw ? (JSON.parse(raw) as Partial<Store>) : {}
    return { rivals: s.rivals ?? {}, groups: s.groups ?? {}, seen: s.seen ?? [] }
  } catch {
    return { rivals: {}, groups: {}, seen: [] }
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: the record just isn't kept */
  }
}

const empty = (): Tally => ({ w: 0, l: 0, d: 0 })
const FIELD = { win: 'w', loss: 'l', draw: 'd' } as const
const bump = (t: Tally, o: Outcome): Tally => ({ ...t, [FIELD[o]]: t[FIELD[o]] + 1 })

/** Pass & play has no uids: the pair of names is the rival. Sorted, so swapping seats is the same pair. */
export function localKey(names: [string, string]) {
  const [a, b] = [...names].map((n) => n.trim().toLowerCase()).sort()
  return `local:${a}|${b}`
}

/**
 * Count one finished match (from "my" side — in pass & play, the side of the name that sorts first),
 * with the feats each side earned in it. Safe to call repeatedly: a matchId already counted is ignored.
 * Returns the rival's record either way.
 */
export function recordResult(r: {
  game: string
  key: string
  name: string
  outcome: Outcome
  matchId: string
  feats?: { me: string[]; them: string[] }
}): Rival {
  const s = read()
  const prev = s.rivals[r.key]
  if (s.seen.includes(r.matchId) && prev) return prev

  const base: Rival = prev ?? { name: r.name, total: empty(), byGame: {}, streak: null, updatedAt: 0 }
  const who = r.outcome === 'win' ? 'me' : r.outcome === 'loss' ? 'them' : null
  const feats = { ...base.feats }
  for (const side of ['me', 'them'] as const)
    for (const id of r.feats?.[side] ?? []) {
      const t = feats[id] ?? { me: 0, them: 0 }
      feats[id] = { ...t, [side]: t[side] + 1 }
    }
  const next: Rival = {
    name: r.name,
    total: bump(base.total, r.outcome),
    byGame: { ...base.byGame, [r.game]: bump(base.byGame[r.game] ?? empty(), r.outcome) },
    streak: who ? { who, n: base.streak?.who === who ? base.streak.n + 1 : 1 } : null,
    updatedAt: Date.now(),
    last: r.game,
    ...(Object.keys(feats).length ? { feats } : {}),
  }
  s.rivals[r.key] = next
  s.seen = [...s.seen, r.matchId].slice(-SEEN_MAX)
  write(s)
  return next
}

/** Flip a record to the other side's point of view (pass & play, when seat 1's name sorts first). */
export function flip(r: Rival): Rival {
  const f = (t: Tally): Tally => ({ w: t.l, l: t.w, d: t.d })
  return {
    ...r,
    total: f(r.total),
    byGame: Object.fromEntries(Object.entries(r.byGame).map(([g, t]) => [g, f(t)])),
    streak: r.streak && { who: r.streak.who === 'me' ? 'them' : 'me', n: r.streak.n },
    feats: r.feats && Object.fromEntries(Object.entries(r.feats).map(([id, t]) => [id, { me: t.them, them: t.me }])),
  }
}

/**
 * The lines shown on Results. `me` is "You" online, or player 1's name in pass & play; `them` the other name.
 * e.g. "You lead Seven 7–5 all-time" · "Seven leads 5–3 all-time" · "All square at 4–4"
 */
export function describe(r: Rival, me: string, them: string, gameName: (slug: string) => string) {
  const { w, l, d } = r.total
  const you = me === 'You'
  const drawn = d ? ` (${d} drawn)` : ''
  const line =
    w === l
      ? you
        ? `All square with ${them} at ${w}–${l}${drawn}`
        : `${me} and ${them} are all square at ${w}–${l}${drawn}`
      : w > l
        ? `${me} ${you ? 'lead' : 'leads'} ${them} ${w}–${l} all-time${drawn}`
        : `${them} leads ${you ? 'you' : me} ${l}–${w} all-time${drawn}`

  const s = r.streak
  const streak = s && s.n >= 2 ? `${s.who === 'me' ? me : them} ${s.who === 'me' && you ? 'have' : 'has'} won ${s.n} in a row` : null

  const games = Object.entries(r.byGame).sort((a, b) => b[1].w + b[1].l + b[1].d - (a[1].w + a[1].l + a[1].d))
  const split = games.length > 1 ? games.map(([g, t]) => `${gameName(g)} ${t.w}–${t.l}`).join(' · ') : null

  return { line, streak, split }
}

/** Everyone you've played, most recent first, with their storage key. */
export function listRivals(): (Rival & { key: string })[] {
  return Object.entries(read().rivals)
    .map(([key, r]) => ({ ...r, key }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** The game to offer a rematch in: the last one played, else the most played. */
export function lastGame(r: Rival): string | undefined {
  if (r.last) return r.last
  const played = (t: Tally) => t.w + t.l + t.d
  return Object.entries(r.byGame).sort((a, b) => played(b[1]) - played(a[1]))[0]?.[0]
}

/* ── Groups of three or four ─────────────────────────────────────────── */

/** A group's key: its members, sorted, so the same people always land on the same record. */
export const groupKey = (members: string[], local: boolean) => `${local ? 'localgroup' : 'group'}:${[...members].sort().join('|')}`

/** Count one finished match for a group. `winner` is the winning member's key, or null when level at the top. */
export function recordGroup(r: { game: string; key: string; members: Record<string, string>; you?: string; winner: string | null; matchId: string }): Group {
  const s = read()
  const prev = s.groups[r.key]
  if (s.seen.includes(r.matchId) && prev) return prev
  const base: Group = prev ?? { members: r.members, played: 0, wins: {}, byGame: {}, streak: null, updatedAt: 0 }
  const add = (w: Record<string, number>) => (r.winner ? { ...w, [r.winner]: (w[r.winner] ?? 0) + 1 } : w)
  const g = base.byGame[r.game] ?? { played: 0, wins: {} }
  const next: Group = {
    members: { ...base.members, ...r.members },
    ...(r.you ? { you: r.you } : {}),
    played: base.played + 1,
    wins: add(base.wins),
    byGame: { ...base.byGame, [r.game]: { played: g.played + 1, wins: add(g.wins) } },
    streak: r.winner ? { who: r.winner, n: base.streak?.who === r.winner ? base.streak.n + 1 : 1 } : null,
    updatedAt: Date.now(),
    last: r.game,
  }
  s.groups[r.key] = next
  s.seen = [...s.seen, r.matchId].slice(-SEEN_MAX)
  write(s)
  return next
}

/** Members by wins, most first: [key, name, wins]. `you` (online: your uid) is named "You". */
export function standings(wins: Record<string, number>, members: Record<string, string>, you?: string): [string, string, number][] {
  return Object.entries(members)
    .map(([k, n]) => [k, k === you ? 'You' : n, wins[k] ?? 0] as [string, string, number])
    .sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]))
}

/** "Seven leads the group" · "Seven and You share the lead" · "All square" */
export function groupLead(table: [string, string, number][]): string {
  const top = table[0]?.[2] ?? 0
  const leaders = table.filter((t) => t[2] === top).map((t) => t[1])
  if (!top || leaders.length === table.length) return 'All square'
  if (leaders.length === 1) return `${leaders[0]} ${leaders[0] === 'You' ? 'lead' : 'leads'} the group`
  return `${leaders.slice(0, -1).join(', ')} and ${leaders.at(-1)} share the lead`
}

/** "Seven 3 · You 2 · Esi 1" */
export const standingLine = (table: [string, string, number][]) => table.map(([, n, w]) => `${n} ${w}`).join(' · ')

/** Every group you've finished a match with, most recent first, with their storage key. */
export function listGroups(): (Group & { key: string })[] {
  return Object.entries(read().groups)
    .map(([key, g]) => ({ ...g, key }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
