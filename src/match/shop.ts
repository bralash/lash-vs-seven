/*
 * The shop's catalogue (store plan, promo/store-plan.html). Chips only buy looks: nothing here helps
 * anyone win. Characters, the wardrobe, throwables and sticker packs are on sale (their prices live
 * with them: OpsFace.tsx, faces/wardrobe.tsx, Throws.tsx, Reactions.tsx); every other shelf is
 * listed with its planned prices and marked Soon until it's built.
 */

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
  {
    id: 'wins',
    name: 'Wins',
    blurb: 'Swap the confetti for something louder when you win.',
    soon: [
      { name: 'Gold chip rain', price: 300 },
      { name: 'Fireworks', price: 450 },
      { name: 'Champion banner', price: 600, note: 'With a trumpet blast' },
    ],
  },
  {
    id: 'flair',
    name: 'Flair',
    blurb: 'Show off on your score card in every match.',
    soon: [
      { name: 'Frames', price: 150 },
      { name: 'Titles', price: 300, note: 'Spar King, Ludo Menace… some earned free with feats' },
      { name: 'Name in gold', price: 500 },
    ],
  },
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
