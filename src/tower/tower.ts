import { get, onValue, ref, runTransaction } from 'firebase/database'
import { useEffect, useState } from 'react'
import { db, signIn } from '../lib/firebase'
import { checkpointBelow, floorOf, HEARTS, seasonOf, TOP } from './floors'

/** the champion's prize, a hat in the wardrobe that can't be bought */
export const CROWN_ID = 'towercrown'

/*
 * Your climb, in the wallet: wallets/{uid}/tower = { s: season, at: the floor you're on, hearts,
 * best: the highest floor reached, got: {floor: true} for floors already paid this season }.
 * A new season (month) starts the climb again from floor 1, and every floor pays again.
 *
 * Win a floor: on to the next (and its chips, the first time this season). Lose: a heart. Out of
 * hearts: back to the last checkpoint at or below you, with the hearts filled up again.
 */

export interface Climb {
  s: number
  at: number
  hearts: number
  best: number
  got?: Record<string, true>
  /** the last match counted (so saving the same result again changes nothing) */
  k?: string
  /** beat Ops at the top this season: Tower champion */
  champ?: boolean
}
interface WalletLike {
  chips?: number
  tower?: Climb
  owned?: Record<string, true>
  [k: string]: unknown
}

export const freshClimb = (s = seasonOf()): Climb => ({ s, at: 1, hearts: HEARTS, best: 1 })
const current = (c: Climb | null | undefined, s = seasonOf()): Climb => (c && c.s === s ? c : freshClimb(s))

/** My climb this season, live (null until it's known). */
export function useClimb(): Climb | null {
  const [c, setC] = useState<Climb | null>(null)
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    signIn()
      .then((uid) => {
        if (!alive) return
        stop = onValue(
          ref(db, `wallets/${uid}/tower`),
          (snap) => setC(current(snap.val() as Climb | null)),
          () => setC(freshClimb()),
        )
      })
      .catch(() => setC(freshClimb()))
    return () => {
      alive = false
      stop?.()
    }
  }, [])
  return c
}

export interface Outcome {
  won: boolean
  /** chips paid for a first clear */
  paid: number
  /** the climb after */
  climb: Climb
  /** out of hearts: dropped back to this floor */
  fell?: number
  /** won the Tower crown just now (the first time ever) */
  crown?: boolean
  /** climbed onto a checkpoint missing hearts: they're filled up again */
  refilled?: boolean
}

/**
 * Records a floor's result once: `key` is the match, so saving it again (a refresh, a retry) changes
 * nothing. Only the floor you're on counts. Returns what happened, or null if it couldn't be saved.
 */
export async function settleFloor(floor: number, won: boolean, key: string): Promise<Outcome | null> {
  const s = seasonOf()
  try {
    const uid = await signIn()
    const at = ref(db, `wallets/${uid}`)
    await get(at) // so the transaction starts from the real wallet
    let out: Outcome | null = null
    const res = await runTransaction(
      at,
      (cur: WalletLike | null) => {
        out = null
        if (!cur) return cur // an empty first pass: the server retries with the real wallet
        const c = current(cur.tower, s)
        if (c.k === key.slice(0, 40)) {
          out = { won, paid: 0, climb: c } // already counted: say so, change nothing
          return
        }
        if (c.at !== floor) return // not your floor
        let next: Climb
        let paid = 0
        let fell: number | undefined
        let crown = false
        let refilled = false
        if (won) {
          const first = !c.got?.[floor]
          paid = first ? (floorOf(floor)?.reward ?? 0) : 0
          const up = Math.min(TOP, floor + 1)
          next = { ...c, at: floor === TOP ? TOP : up, best: Math.max(c.best, up), got: { ...c.got, [floor]: true } }
          // reaching a checkpoint fills your hearts up again: you face the floors above at full strength
          if (floor < TOP && floorOf(up)?.checkpoint && c.hearts < HEARTS) {
            next.hearts = HEARTS
            refilled = true
          }
          if (floor === TOP) {
            next.champ = true
            crown = !cur.owned?.[CROWN_ID]
          }
        } else if (c.hearts > 1) next = { ...c, hearts: c.hearts - 1 }
        else {
          fell = checkpointBelow(floor)
          next = { ...c, at: fell, hearts: HEARTS }
        }
        next.k = key.slice(0, 40)
        out = { won, paid, climb: next, fell, crown, ...(refilled ? { refilled } : {}) }
        return { ...cur, chips: (cur.chips ?? 0) + paid, tower: next, ...(crown ? { owned: { ...cur.owned, [CROWN_ID]: true } } : {}) }
      },
      { applyLocally: false },
    )
    return res.committed || out ? out : null
  } catch {
    return null
  }
}
