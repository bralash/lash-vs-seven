/*
 * The shop's catalogue (store plan, promo/store-plan.html). Chips only buy looks: nothing here helps
 * anyone win. Characters are on sale now (their prices live with the faces, in OpsFace.tsx); every
 * other shelf is listed with its planned prices and marked Soon until it's built.
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
  {
    id: 'wardrobe',
    name: 'Wardrobe',
    blurb: 'Hats, outfits and paint for your character.',
    soon: [
      { name: 'Kente scarf', price: 400 },
      { name: 'Black Stars jersey', price: 500 },
      { name: 'Crown', price: 600 },
      { name: 'Snapback', price: 200 },
      { name: 'Kufi', price: 200 },
      { name: 'Party hat', price: 100 },
      { name: 'Tux', price: 500 },
      { name: 'Fugu smock', price: 400 },
      { name: 'Gold paint', price: 800 },
    ],
  },
  {
    id: 'throws',
    name: 'Throwables',
    blurb: 'New things to throw at faces, each with its own splat.',
    soon: [
      { name: 'Chalewote slipper', price: 250 },
      { name: 'Water balloon', price: 250 },
      { name: 'Custard pie', price: 250 },
      { name: 'Fan Ice', price: 250 },
      { name: 'Kenkey ball', price: 250 },
    ],
  },
  {
    id: 'stickers',
    name: 'Stickers',
    blurb: 'Six extra reactions in the tray.',
    soon: [
      { name: 'Ghana pack', price: 200, note: 'Chale, Herh!, Ei!, Ayekoo, Sharp, Small small' },
      { name: 'Football pack', price: 200, note: 'Goal!, Offside!, Red card, VAR' },
    ],
  },
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
