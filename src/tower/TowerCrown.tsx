import { HatArt } from '../components/faces/wardrobe'

/** The champion's prize, drawn on its own. */
export function TowerCrown({ size = 40 }: { size?: number }) {
  return (
    <span className="tw-crown" role="img" aria-label="The Tower crown">
      <HatArt id="towercrown" size={size} />
    </span>
  )
}
