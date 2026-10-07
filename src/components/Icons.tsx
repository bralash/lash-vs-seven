// Inline stroke icons (no icon-font dependency).
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  'aria-hidden': true,
}

export const ArrowLeft = () => (
  <svg {...base}><path d="M20 12H5M11 5l-7 7 7 7" /></svg>
)
export const SoundOn = () => (
  <svg {...base}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
)
export const SoundOff = () => (
  <svg {...base}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
)
export const Close = () => (
  <svg {...base}><path d="M5 5l14 14M19 5L5 19" /></svg>
)
export const Copy = () => (
  <svg {...base}><path d="M9 9h11v11H9z" /><path d="M5 15H4V4h11v1" /></svg>
)
export const Exit = () => (
  <svg {...base}><path d="M14 4H5v16h9" /><path d="M10 12h11M17 8l4 4-4 4" /></svg>
)
