import type { ReactNode } from 'react'

/*
 * The 18 card faces: the classic game's treasure set (compass, gem, map, trophy, key, star, coin,
 * hourglass) and ten more for the big board. Each is a chunky ink-outlined picture on its own colour,
 * drawn in a 40×40 box. A 4×4 board uses the first eight.
 */

const INK = '#121016'
const S = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

export interface Face {
  name: string
  bg: string
  art: ReactNode
}

export const FACES: Face[] = [
  {
    name: 'Compass',
    bg: '#bfe3d0',
    art: (
      <>
        <circle cx="20" cy="20" r="13" fill="#fbf7ee" {...S} />
        <path d="M20 9l4 11-4 11-4-11z" fill="#ff5a1f" {...S} />
        <path d="M20 20l4 0-4 11-4-11z" fill="#fbf7ee" {...S} />
      </>
    ),
  },
  {
    name: 'Gem',
    bg: '#d6c8f5',
    art: (
      <>
        <path d="M8 16l6-7h12l6 7-12 15z" fill="#7b5cff" {...S} />
        <path d="M8 16h24M14 9l6 22 6-22" fill="none" {...S} />
      </>
    ),
  },
  {
    name: 'Map',
    bg: '#f6dcb4',
    art: (
      <>
        <path d="M7 11l8-3 10 3 8-3v21l-8 3-10-3-8 3z" fill="#fbf7ee" {...S} />
        <path d="M15 8v21M25 11v21" fill="none" {...S} />
        <path d="M17 18l4 4M21 18l-4 4" stroke="#e8291c" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    name: 'Trophy',
    bg: '#fff0a8',
    art: (
      <>
        <path d="M12 8h16v7a8 8 0 0 1-16 0z" fill="#ffd23f" {...S} />
        <path d="M12 11H8a4 4 0 0 0 4 6M28 11h4a4 4 0 0 1-4 6M20 23v5M14 32h12l-2-4h-8z" fill="none" {...S} />
      </>
    ),
  },
  {
    name: 'Key',
    bg: '#ffd9c7',
    art: (
      <>
        <circle cx="13" cy="20" r="6" fill="#ffd23f" {...S} />
        <path d="M19 20h14M28 20v5M32 20v4" fill="none" {...S} />
      </>
    ),
  },
  {
    name: 'Star',
    bg: '#c9dcff',
    art: <path d="M20 6l4.2 9 9.8 1.1-7.3 6.6 2 9.6L20 27.4l-8.7 4.9 2-9.6L6 16.1l9.8-1.1z" fill="#ffd23f" {...S} />,
  },
  {
    name: 'Coin',
    bg: '#e2efb8',
    art: (
      <>
        <circle cx="20" cy="20" r="12" fill="#f5b800" {...S} />
        <circle cx="20" cy="20" r="7" fill="none" {...S} />
        <path d="M20 15v10" fill="none" {...S} />
      </>
    ),
  },
  {
    name: 'Hourglass',
    bg: '#f5cfe0',
    art: (
      <>
        <path d="M11 7h18M11 33h18" fill="none" {...S} />
        <path d="M13 7c0 8 14 8 14 13s-14 5-14 13h14c0-8-14-8-14-13s14-5 14-13z" fill="#fbf7ee" {...S} />
        <path d="M16 29h8l-4-4z" fill="#f5b800" />
      </>
    ),
  },
  {
    name: 'Anchor',
    bg: '#c3e4f0',
    art: (
      <>
        <circle cx="20" cy="9" r="3" fill="#fbf7ee" {...S} />
        <path d="M20 12v20M14 17h12M9 23a11 11 0 0 0 22 0" fill="none" {...S} />
      </>
    ),
  },
  {
    name: 'Crown',
    bg: '#ffe6a3',
    art: <path d="M8 28l-2-16 8 7 6-11 6 11 8-7-2 16z" fill="#ffd23f" {...S} />,
  },
  {
    name: 'Bell',
    bg: '#dcd3c2',
    art: (
      <>
        <path d="M11 27c2-3 2-6 2-10a7 7 0 0 1 14 0c0 4 0 7 2 10z" fill="#f5b800" {...S} />
        <path d="M17 31a3 3 0 0 0 6 0M20 8V6" fill="none" {...S} />
      </>
    ),
  },
  {
    name: 'Heart',
    bg: '#ffd0cc',
    art: <path d="M20 32S7 24 7 15.5A6.5 6.5 0 0 1 20 13a6.5 6.5 0 0 1 13 2.5C33 24 20 32 20 32z" fill="#e8291c" {...S} />,
  },
  {
    name: 'Moon',
    bg: '#cfd2f0',
    art: <path d="M25 7a13 13 0 1 0 8 21A11 11 0 0 1 25 7z" fill="#fbf7ee" {...S} />,
  },
  {
    name: 'Bolt',
    bg: '#fff3b0',
    art: <path d="M22 5L10 22h8l-2 13 12-17h-8z" fill="#ffd23f" {...S} />,
  },
  {
    name: 'Flag',
    bg: '#d0ecd9',
    art: (
      <>
        <path d="M11 34V6" fill="none" {...S} />
        <path d="M11 8h18l-4 6 4 6H11z" fill="#1f9d55" {...S} />
      </>
    ),
  },
  {
    name: 'Sun',
    bg: '#ffe0b8',
    art: (
      <>
        <path d="M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M8.7 31.3l3.5-3.5M27.8 12.2l3.5-3.5" fill="none" {...S} />
        <circle cx="20" cy="20" r="7" fill="#ff5a1f" {...S} />
      </>
    ),
  },
  {
    name: 'Drop',
    bg: '#cde9fb',
    art: <path d="M20 5c6 9 10 14 10 19a10 10 0 0 1-20 0c0-5 4-10 10-19z" fill="#2d5bff" {...S} />,
  },
  {
    name: 'Leaf',
    bg: '#d9efc4',
    art: (
      <>
        <path d="M8 32C8 16 18 8 33 7c0 15-9 25-25 25z" fill="#1f9d55" {...S} />
        <path d="M8 32L24 16" fill="none" {...S} />
      </>
    ),
  },
]

/** A card's picture: card k shows face ⌊k/2⌋. */
export function FaceArt({ face }: { face: Face }) {
  return (
    <svg viewBox="0 0 40 40" className="mem-face__art" aria-hidden="true">
      {face.art}
    </svg>
  )
}
