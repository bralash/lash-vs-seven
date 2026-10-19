/*
 * The shop's catalogue (store plan, promo/store-plan.html). Chips only buy looks: nothing here helps
 * anyone win. Characters, the wardrobe, throwables, sticker packs, wins and flair are on sale (their prices live
 * with them: OpsFace.tsx, faces/wardrobe.tsx, Throws.tsx, Reactions.tsx, flair.tsx); every other shelf is
 * listed with its planned prices and marked Soon until it's built.
 */

/**
 * When each item came into the shop (its id → the day, YYYY-MM-DD): for its first three days it wears
 * a New tag, and so does its shelf's tab, until you own it. Add a line here with every new item.
 */
export const ADDED: Record<string, string> = {
  // the Wins and Flair shelves opened
  chiprain: '2026-10-19',
  akwaaba: '2026-10-19',
  fireworks: '2026-10-19',
  banner: '2026-10-19',
  fkente: '2026-10-19',
  fflag: '2026-10-19',
  fneon: '2026-10-19',
  tchair: '2026-10-19',
  todogwu: '2026-10-19',
  tmenace: '2026-10-19',
  tboss: '2026-10-19',
  twizard: '2026-10-19',
  tnomercy: '2026-10-19',
  goldname: '2026-10-19',
}
const NEW_DAYS = 3

/** is this item still new (in its first three days in the shop) */
export function isNew(id: string, now = Date.now()) {
  const day = ADDED[id]
  if (!day) return false
  const from = new Date(`${day}T00:00:00`).getTime()
  return now >= from && now < from + NEW_DAYS * 86_400_000
}

export type ShelfId = 'characters' | 'wardrobe' | 'throws' | 'stickers' | 'wins' | 'flair' | 'skins'

export interface SoonItem {
  name: string
  /** the planned price, in chips */
  price: number
  note?: string
}

export interface Shelf {
  id: ShelfId
  name: string
  blurb: string
  /** items you can't buy yet */
  soon?: SoonItem[]
}

export const SHELVES: Shelf[] = [
  { id: 'characters', name: 'Characters', blurb: 'The face you wear on your score card, with their own throw, taunt and ultimate. The four robots are free.' },
  { id: 'wardrobe', name: 'Wardrobe', blurb: 'Hats, something round the neck, and paint for your character. One of each at a time; everyone gets the party hat.' },
  { id: 'throws', name: 'Throwables', blurb: 'New things to throw at faces, each with its own splat. Characters throw their own until you pick one here.' },
  { id: 'stickers', name: 'Stickers', blurb: 'Six extra reactions in the tray, a pack at a time. Everyone sees them, whether they own the pack or not.' },
  { id: 'wins', name: 'Wins', blurb: 'Swap the confetti for something louder when you win a match. Tap one to see it.' },
  { id: 'flair', name: 'Flair', blurb: 'On your score card in every match, for everyone to see: a frame, a title over it, your name in gold. One of each at a time.' },
  {
    id: 'skins',
    name: 'Skins',
    blurb: 'Card backs and boards, one game at a time.',
    soon: [
      { name: 'Spar card backs', price: 400 },
      { name: 'Ludo boards', price: 600 },
      { name: 'Connect Four discs', price: 400 },
      { name: 'Memory card backs', price: 400 },
      { name: 'Ultimate skins', price: 800, note: 'A gold Snap, a camo Airstrike, a neon Thwip' },
    ],
  },
]
