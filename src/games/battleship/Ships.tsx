import type { ShipId } from './engine'
import carrier from './sprites/carrier.webp'
import carrierSunk from './sprites/carrier-sunk.webp'
import battleship from './sprites/battleship.webp'
import battleshipSunk from './sprites/battleship-sunk.webp'
import cruiser from './sprites/cruiser.webp'
import cruiserSunk from './sprites/cruiser-sunk.webp'
import submarine from './sprites/submarine.webp'
import submarineSunk from './sprites/submarine-sunk.webp'
import destroyer from './sprites/destroyer.webp'
import destroyerSunk from './sprites/destroyer-sunk.webp'

/*
 * Ship sprites, bow to the right. Each intact/sunk pair shares one canvas, so the wreck lands exactly
 * where the ship was. `hull` is the ship's body inside that canvas (masts, smoke and flames left out):
 * it's what gets fitted to the ship's squares, and everything else spills over.
 * Sizes are in sprite pixels (art/battleship-chatgpt/ holds the full-size originals).
 */
const ART: Record<ShipId, { src: string; sunk: string; w: number; h: number; hull: { x: number; y: number; w: number; h: number } }> = {
  carrier: { src: carrier, sunk: carrierSunk, w: 700, h: 208, hull: { x: 0, y: 39, w: 700, h: 166 } },
  battleship: { src: battleship, sunk: battleshipSunk, w: 564, h: 124, hull: { x: 0, y: 32, w: 560, h: 90 } },
  cruiser: { src: cruiser, sunk: cruiserSunk, w: 420, h: 117, hull: { x: 0, y: 35, w: 420, h: 78 } },
  submarine: { src: submarine, sunk: submarineSunk, w: 420, h: 85, hull: { x: 0, y: 16, w: 420, h: 63 } },
  destroyer: { src: destroyer, sunk: destroyerSunk, w: 280, h: 82, hull: { x: 0, y: 31, w: 280, h: 48 } },
}

/** How wide a ship's body is drawn across the board, in squares: chunky art is squeezed, slim art widened. */
const MIN_BEAM = 0.5
const MAX_BEAM = 0.86

export const shipImage = (id: ShipId, sunk = false) => (sunk ? ART[id].sunk : ART[id].src)

/**
 * A ship on the grid, in its own [0, len] × [0, 1] strip: its first square is (col, row) and `down`
 * turns it to run down the board, bow at the bottom. Placed with a CSS transform so moves and turns slide.
 */
export function ShipSprite({ id, len, col, row, down, sunk, cls }: { id: ShipId; len: number; col: number; row: number; down: boolean; sunk?: boolean; cls: string }) {
  const a = ART[id]
  const s = (len - 0.1) / a.hull.w
  const sy = Math.min(Math.max(s, MIN_BEAM / a.hull.h), MAX_BEAM / a.hull.h)
  const x = len / 2 - (a.hull.x + a.hull.w / 2) * s
  const y = 0.5 - (a.hull.y + a.hull.h / 2) * sy
  const place = down ? `translate(${col + 1}px, ${row}px) rotate(90deg)` : `translate(${col}px, ${row}px) rotate(0deg)`
  return (
    <g className={cls} style={{ transform: place }}>
      <rect x={0.05} y={0.05} width={len - 0.1} height={0.9} className="bs-ship__pick" />
      <image href={sunk ? a.sunk : a.src} x={x} y={y} width={a.w * s} height={a.h * sy} preserveAspectRatio="none" />
    </g>
  )
}
