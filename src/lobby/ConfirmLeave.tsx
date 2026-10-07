import { useEffect, useState } from 'react'
import { Exit } from '../components/Icons'
import { Modal } from '../components/Modal'

export type LeaveKind = 'match' | 'close'

interface Props {
  kind: LeaveKind
  /** the other player's name, if there is one */
  other: string | null
  onStay: () => void
  onLeave: () => void
}

/** How long the destructive button stays inert, so a double-tap on "Leave" can't confirm by accident. */
const ARM_MS = 400

export function ConfirmLeave({ kind, other, onStay, onLeave }: Props) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ARM_MS)
    return () => clearTimeout(t)
  }, [])

  const them = other ?? (kind === 'match' ? 'Your opponent' : 'Your guest')
  const copy =
    kind === 'match'
      ? {
          title: 'Leave the match?',
          body: `${them} will be left playing on their own. You can come back with the room link while the room is open.`,
          stay: 'Keep playing',
          leave: 'Leave match',
        }
      : {
          title: 'Close the room?',
          body: `${them} is waiting in this room. Closing it sends them back to the start.`,
          stay: 'Keep room open',
          leave: 'Close room',
        }

  return (
    <Modal title={copy.title} onClose={onStay}>
      <p className="confirm__body">{copy.body}</p>
      <div className="confirm__actions">
        <button type="button" className="btn btn--primary" onClick={onStay} data-autofocus>
          {copy.stay}
        </button>
        <button type="button" className="btn btn--danger" onClick={onLeave} disabled={!armed} aria-disabled={!armed}>
          <Exit /> {copy.leave}
        </button>
      </div>
    </Modal>
  )
}
