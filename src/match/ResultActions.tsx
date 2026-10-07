import { ShareResult } from './ShareResult'
import type { CardInput } from './shareCard'

interface Props {
  card: CardInput
  /** text sent alongside the share image */
  message: string
  /** the rematch button's resting label, e.g. "Play again" / "New puzzle" */
  again?: string
  oppName?: string
  imReady: boolean
  oppReady: boolean
  /** the other player left or dropped: a rematch can't happen, so the button takes you out instead */
  oppGone: boolean
  onReady: () => void
  onLeave: () => void
}

/**
 * The one row of actions under every result: share (icon) beside the rematch button.
 * Leaving mid-series is the top bar's Leave; once the other player is gone the rematch button becomes the way out.
 */
export function ResultActions({ card, message, again = 'Play again', oppName = 'Opponent', imReady, oppReady, oppGone, onReady, onLeave }: Props) {
  // context goes in the note; the button keeps a short label so the row stays one line on a phone
  const note = oppGone
    ? `${oppName} left the room`
    : imReady && !oppReady
      ? `Waiting for ${oppName}…`
      : oppReady && !imReady
        ? `${oppName} wants a rematch`
        : null
  return (
    <div className="mt-result-actions" aria-live="polite">
      {note && <p className="hint mt-result-actions__note">{note}</p>}
      <ShareResult card={card} message={message} />
      {oppGone ? (
        <button type="button" className="btn btn--primary btn--lg" onClick={onLeave}>
          Back to lobby <span className="keycap">↵</span>
        </button>
      ) : (
        <button type="button" className="btn btn--primary btn--lg" onClick={onReady} disabled={imReady}>
          {imReady ? (oppReady ? 'Dealing…' : 'Ready') : oppReady ? 'Rematch' : again}
          <span className="keycap">↵</span>
        </button>
      )}
    </div>
  )
}
