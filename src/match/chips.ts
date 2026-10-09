import { get, onValue, ref, runTransaction } from 'firebase/database'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, signIn } from '../lib/firebase'
import { pickedCrewLook, priceOf, type OpsStyle } from '../components/OpsFace'
import type { Level } from './bot'

/*
 * Chips: what every finished match pays out, spent later in the shop. They live in the database at
 * wallets/{uid}: the balance, and a short ledger of the matches already paid (so a refresh or a
 * second results screen never pays twice, and so the first-match-of-the-day bonus and the daily cap
 * against one rival can be counted). The rules only let a player touch their own wallet and cap
 * how much one write can add. Looks only: chips buy nothing that helps anyone win.
 *
 * Who gets paid: online players at the end of a match, and you when you beat Ops. Pass & play pays
 * nothing (one person could play both sides), nor does watching, nor a match that ended because
 * someone left.
 */

/** the chip values, biggest first, and how each one looks */
export const CHIPS = [
  { v: 500, face: '#8a3fd1', notch: '#fbf7ee', text: '#fbf7ee' },
  { v: 100, face: '#17151c', notch: '#ffd23f', text: '#ffd23f' },
  { v: 25, face: '#2d5bff', notch: '#fbf7ee', text: '#fbf7ee' },
  { v: 5, face: '#e8452c', notch: '#fbf7ee', text: '#fbf7ee' },
  { v: 1, face: '#f4f1ea', notch: '#121016', text: '#121016' },
] as const
export type ChipValue = (typeof CHIPS)[number]['v']

/** what each thing pays */
export const PAY = {
  win: 25,
  loss: 5,
  draw: 10,
  firstToday: 15,
  /** each win from the 3rd in a row against the same rival(s) */
  streak: 10,
  feat: 100,
  /** a 3–4 player match seen through to the end */
  stayed: 5,
  opsWin: 5,
  opsHardWin: 15,
} as const

/** the most one match can pay; the database rules hold every write to this */
export const MAX_PAYOUT = 600
/** paid wins against the same rival (or group) per day; after that a win pays like a loss */
const RIVAL_WINS_A_DAY = 3
/** a match over quicker than this pays nothing */
const MIN_MATCH_MS = 20_000
/** ledger entries are kept this many days (long enough for "today" in any timezone) */
const KEEP_DAYS = 2

interface Paid {
  /** the local day it was paid, YYYY-MM-DD */
  d: string
  /** whom it was against (their id, or the group's key), for the daily cap */
  r?: string
  /** a win */
  w?: boolean
  /** the total paid */
  t: number
}
interface Wallet {
  chips: number
  paid?: Record<string, Paid>
  /** the faces bought (or kept: whoever already wore one when they went on sale) */
  owned?: Partial<Record<OpsStyle, true>>
}

export interface PayLine {
  label: string
  n: number
}
export interface Payout {
  /** the match it's for */
  key: string
  lines: PayLine[]
  total: number
  /** paid just now (false: this match was already paid, shown again on a revisit) */
  fresh: boolean
  /** when it came in, so a results screen only shows its own */
  at: number
}

export interface Result {
  /** the match id the rivalry record uses */
  key: string
  outcome: 'win' | 'loss' | 'draw'
  /** online: the opponent's id or the group's key (the daily cap counts per rival) */
  rival?: string
  /** your run of wins against them, this one included */
  streak?: number
  /** feats you earned this match */
  feats?: number
  /** a 3–4 player match you stayed in to the end */
  stayed?: boolean
  /** a match against Ops, at this level */
  ops?: Level
  /** when the match started (server or device time) */
  startedAt?: number
}

const today = (t = Date.now()) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What a result pays, given the wallet's ledger. */
function linesFor(r: Result, paid: Record<string, Paid>): PayLine[] {
  const day = today()
  if (r.ops) {
    if (r.outcome !== 'win') return []
    return [{ label: r.ops === 'hard' ? 'Beat Ops on Hard' : 'Beat Ops', n: r.ops === 'hard' ? PAY.opsHardWin : PAY.opsWin }]
  }
  const lines: PayLine[] = []
  const winsToday = Object.values(paid).filter((p) => p.d === day && p.w && r.rival && p.r === r.rival).length
  if (r.outcome === 'win') lines.push(winsToday < RIVAL_WINS_A_DAY ? { label: 'Win', n: PAY.win } : { label: 'Win (daily limit vs them)', n: PAY.loss })
  else if (r.outcome === 'draw') lines.push({ label: 'Draw', n: PAY.draw })
  else lines.push({ label: 'Played', n: PAY.loss })
  if (!Object.values(paid).some((p) => p.d === day)) lines.push({ label: 'First match today', n: PAY.firstToday })
  if (r.outcome === 'win' && (r.streak ?? 0) >= 3 && winsToday < RIVAL_WINS_A_DAY) lines.push({ label: `${r.streak} in a row`, n: PAY.streak })
  if (r.feats) lines.push({ label: r.feats === 1 ? 'Feat' : `${r.feats} feats`, n: PAY.feat * r.feats })
  if (r.stayed) lines.push({ label: 'Stayed to the end', n: PAY.stayed })
  return lines
}

/* ── the latest payout, for the results screen ── */

let latest: Payout | null = null
const listeners = new Set<() => void>()
const show = (p: Payout) => {
  latest = p
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}

/** The payout that came in since `since` (the results screen's first render), if any. */
export function usePayout(since: number) {
  const p = useSyncExternalStore(subscribe, () => latest)
  return p && p.at >= since ? p : null
}

/**
 * Pays this result into my wallet once. Safe to call on every results render: a match already in
 * the ledger isn't paid again (its total is shown instead).
 */
export function payOut(r: Result) {
  if (r.startedAt && Date.now() - r.startedAt < MIN_MATCH_MS) return
  const at = Date.now()
  signIn()
    .then(async (uid) => {
      let lines: PayLine[] = []
      let already: Paid | null = null
      const res = await runTransaction(ref(db, `wallets/${uid}`), (cur: Wallet | null) => {
        const w: Wallet = cur ?? { chips: 0 }
        const paid = w.paid ?? {}
        if (paid[r.key]) {
          already = paid[r.key]
          return // nothing to do: leave it as it is
        }
        already = null
        lines = linesFor(r, paid)
        const total = Math.min(MAX_PAYOUT, lines.reduce((s, l) => s + l.n, 0))
        if (!total) return
        // forget entries older than KEEP_DAYS
        const cutoff = today(Date.now() - KEEP_DAYS * 864e5)
        const kept = Object.fromEntries(Object.entries(paid).filter(([, p]) => p.d >= cutoff))
        const entry: Paid = { d: today(), t: total, ...(r.rival ? { r: r.rival } : {}), ...(r.outcome === 'win' ? { w: true } : {}) }
        return { chips: (w.chips ?? 0) + total, paid: { ...kept, [r.key]: entry } }
      })
      const total = lines.reduce((s, l) => s + l.n, 0)
      if (res.committed && total) show({ key: r.key, lines, total: Math.min(MAX_PAYOUT, total), fresh: true, at })
      else if (already) show({ key: r.key, lines: [], total: (already as Paid).t, fresh: false, at })
    })
    .catch(() => {})
}

/** My balance, live (null until it's known). */
export function useChips(): number | null {
  const [chips, setChips] = useState<number | null>(null)
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    signIn()
      .then((uid) => {
        if (!alive) return
        stop = onValue(
          ref(db, `wallets/${uid}/chips`),
          (s) => setChips(Number(s.val()) || 0),
          () => setChips(0),
        )
      })
      .catch(() => {})
    return () => {
      alive = false
      stop?.()
    }
  }, [])
  return chips
}

/** My wallet, live: the balance and the faces I own (null until it's known). */
export function useWallet(): { chips: number; owned: Partial<Record<OpsStyle, true>> } | null {
  const [w, setW] = useState<{ chips: number; owned: Partial<Record<OpsStyle, true>> } | null>(null)
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    signIn()
      .then((uid) => {
        if (!alive) return
        stop = onValue(
          ref(db, `wallets/${uid}`),
          (s) => {
            const v = (s.val() ?? {}) as Partial<Wallet>
            setW({ chips: Number(v.chips) || 0, owned: v.owned ?? {} })
          },
          () => setW({ chips: 0, owned: {} }),
        )
      })
      .catch(() => {})
    return () => {
      alive = false
      stop?.()
    }
  }, [])
  return w
}

/** Free, or mine. */
export const ownsLook = (owned: Partial<Record<OpsStyle, true>> | undefined, look: OpsStyle) => !priceOf(look) || !!owned?.[look]

/** Buys a face with chips. 'short': not enough chips. */
export async function buyLook(look: OpsStyle): Promise<'ok' | 'short' | 'error'> {
  const price = priceOf(look)
  try {
    const uid = await signIn()
    const at = ref(db, `wallets/${uid}`)
    // read first: a transaction that starts on an empty cache would see no chips and give up
    await get(at)
    let short = false
    const res = await runTransaction(at, (cur: Wallet | null) => {
      const w: Wallet = cur ?? { chips: 0 }
      if (w.owned?.[look]) return
      if ((w.chips ?? 0) < price) {
        short = true
        return
      }
      short = false
      return { ...w, chips: w.chips - price, owned: { ...w.owned, [look]: true } }
    })
    return res.committed ? 'ok' : short ? 'short' : 'ok'
  } catch {
    return 'error'
  }
}

/**
 * Faces went on sale after people had picked them: whoever was already wearing a paid face keeps it
 * for free. Run once the wallet is known; a pick that isn't owned can only be from before the sale.
 */
export async function keepWornLook() {
  const look = pickedCrewLook()
  if (!look || !priceOf(look)) return
  try {
    const uid = await signIn()
    const at = ref(db, `wallets/${uid}`)
    await get(at)
    await runTransaction(at, (cur: Wallet | null) => {
      const w: Wallet = cur ?? { chips: 0 }
      if (w.owned?.[look]) return
      return { ...w, chips: w.chips ?? 0, owned: { ...w.owned, [look]: true } }
    })
  } catch {
    /* rules not there yet: try again next visit */
  }
}

/** A pile of chips adding up to `n`, biggest first (at most `max` chips; the rest stays implied). */
export function chipsFor(n: number, max = 8): ChipValue[] {
  const out: ChipValue[] = []
  let left = n
  for (const c of CHIPS) {
    while (left >= c.v && out.length < max) {
      out.push(c.v)
      left -= c.v
    }
  }
  return out
}
