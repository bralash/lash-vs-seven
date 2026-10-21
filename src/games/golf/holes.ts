import type { Hole } from './physics'

/*
 * Our own bank of holes, on a course 1 wide and 1.6 long (the tee usually near the bottom). Tier 1
 * holes open a match, tier 2 come next and a tier 3 hole finishes it.
 */

const box = (x0: number, y0: number, x1: number, y1: number): Hole['green'] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

export const HOLES: Hole[] = [
  /* ── tier 1 ── */
  {
    id: 'warmup', name: 'Warm-up', par: 2, tier: 1,
    green: box(0.25, 0.1, 0.75, 1.5),
    tee: [0.5, 1.38], cup: [0.5, 0.3],
    bumpers: [[0.5, 0.85, 0.06]],
  },
  {
    id: 'dogleg', name: 'Dogleg', par: 2, tier: 1,
    green: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.62], [0.47, 0.62], [0.47, 1.5], [0.1, 1.5]],
    tee: [0.28, 1.38], cup: [0.74, 0.33],
    walls: [[0.47, 0.62, 0.36, 0.72]],
    sand: [[0.1, 0.1, 0.12]],
  },
  {
    id: 'shelf', name: 'The Shelf', par: 2, tier: 1,
    green: box(0.15, 0.1, 0.85, 1.5),
    tee: [0.32, 1.36], cup: [0.32, 0.32],
    walls: [[0.15, 0.8, 0.6, 0.8]],
    bumpers: [[0.85, 0.8, 0.05]],
  },
  {
    id: 'bunker', name: 'Bunker Hill', par: 2, tier: 1,
    green: box(0.1, 0.12, 0.9, 1.5),
    tee: [0.5, 1.38], cup: [0.5, 0.32],
    sand: [[0.5, 0.78, 0.15]],
    bumpers: [[0.24, 0.55, 0.05], [0.76, 0.55, 0.05]],
  },
  {
    id: 'funnel', name: 'The Funnel', par: 2, tier: 1,
    green: [[0.38, 0.14], [0.62, 0.14], [0.92, 1.5], [0.08, 1.5]],
    tee: [0.5, 1.38], cup: [0.5, 0.32],
    bumpers: [[0.5, 0.95, 0.05]],
  },

  /* ── tier 2 ── */
  {
    id: 'pond', name: 'Pond', par: 2, tier: 2,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.3, 1.36], cup: [0.3, 0.3],
    water: [[0.1, 0.62, 0.55, 0.32]],
    walls: [[0.65, 0.62, 0.65, 0.94]],
  },
  {
    id: 'pinball', name: 'Pinball', par: 3, tier: 2,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.5, 1.38], cup: [0.5, 0.27],
    bumpers: [[0.3, 0.5, 0.06], [0.7, 0.5, 0.06], [0.5, 0.74, 0.07], [0.3, 1.0, 0.06], [0.7, 1.0, 0.06]],
  },
  {
    id: 'zigzag', name: 'Zigzag', par: 3, tier: 2,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.25, 1.36], cup: [0.74, 0.3],
    walls: [[0.1, 1.1, 0.64, 1.1], [0.9, 0.6, 0.36, 0.6]],
    sand: [[0.9, 1.1, 0.1]],
  },
  {
    id: 'bridge', name: 'The Bridge', par: 3, tier: 2,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.5, 1.38], cup: [0.5, 0.28],
    water: [[0.1, 0.52, 0.31, 0.2], [0.59, 0.52, 0.31, 0.2]],
    bumpers: [[0.5, 1.0, 0.05]],
  },
  {
    id: 'gate', name: 'Gatekeeper', par: 3, tier: 2,
    green: box(0.15, 0.1, 0.85, 1.5),
    tee: [0.5, 1.38], cup: [0.5, 0.3],
    walls: [[0.15, 0.8, 0.36, 0.8], [0.64, 0.8, 0.85, 0.8]],
    mover: { a: [0.32, 0.68], b: [0.68, 0.68], len: 0.2, period: 2.6 },
  },

  /* ── tier 3 ── */
  {
    id: 'sweeper', name: 'Sweeper', par: 3, tier: 3,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.5, 1.4], cup: [0.5, 0.25],
    water: [[0.1, 0.9, 0.28, 0.2], [0.62, 0.9, 0.28, 0.2]],
    mover: { a: [0.26, 0.55], b: [0.74, 0.55], len: 0.26, period: 2.2 },
  },
  {
    id: 'hook', name: 'The Hook', par: 3, tier: 3,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.74, 1.38], cup: [0.28, 1.3],
    walls: [[0.5, 1.5, 0.5, 0.48]],
    sand: [[0.1, 0.1, 0.13]],
    bumpers: [[0.5, 0.26, 0.05]],
  },
  {
    id: 'angles', name: 'Angles', par: 3, tier: 3,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.7, 1.4], cup: [0.25, 0.27],
    walls: [[0.1, 1.02, 0.56, 0.86], [0.9, 0.66, 0.44, 0.5]],
    water: [[0.62, 0.98, 0.28, 0.16]],
    sand: [[0.28, 0.66, 0.08]],
  },
  {
    id: 'moat', name: 'Moat', par: 3, tier: 3,
    green: box(0.1, 0.1, 0.9, 1.5),
    tee: [0.5, 1.4], cup: [0.5, 0.24],
    water: [[0.1, 0.72, 0.32, 0.2], [0.58, 0.72, 0.32, 0.2]],
    walls: [[0.4, 0.36, 0.6, 0.36]],
    mover: { a: [0.3, 0.54], b: [0.7, 0.54], len: 0.18, period: 2.4 },
    sand: [[0.2, 0.22, 0.07], [0.8, 0.22, 0.07]],
  },
  {
    id: 'diamond', name: 'Diamond', par: 3, tier: 3,
    green: [[0.5, 0.08], [0.92, 0.8], [0.5, 1.52], [0.08, 0.8]],
    tee: [0.5, 1.38], cup: [0.5, 0.26],
    bumpers: [[0.5, 0.8, 0.09]],
    water: [[0.33, 0.56, 0.065], [0.67, 0.56, 0.065]],
  },
]

const BY_ID = new Map(HOLES.map((h) => [h.id, h]))
export const holeById = (id: string) => BY_ID.get(id) ?? HOLES[0]

const shuffle = <T,>(xs: T[]) => {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Five holes getting harder (two easy, two middling, one hard), then a spare for a playoff. */
export function pickHoles(): string[] {
  const t = (k: number) => shuffle(HOLES.filter((h) => h.tier === k))
  const [e, m, h] = [t(1), t(2), t(3)]
  return [e[0], e[1], m[0], m[1], h[0], shuffle([m[2], h[1]])[0]].map((x) => x.id)
}
