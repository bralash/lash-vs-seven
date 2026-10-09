import { useId, useState, type ReactNode } from 'react'
import { useSound } from '../lib/sound'
import { Modal } from './Modal'

/*
 * Feedback goes to WhatsApp for now: pick Bug or Idea, say what happened, and the button opens
 * WhatsApp with it all written out to the app's number. Nothing is stored here; replies happen in
 * the chat. From a result screen the game is tagged in the message.
 */

/** where feedback goes (WhatsApp, international format, digits only) */
const FEEDBACK_TO = '233503123939'

type Kind = 'bug' | 'idea'
const KINDS: { k: Kind; label: string; hint: string }[] = [
  { k: 'bug', label: '🐞 Bug', hint: 'What went wrong? What were you doing when it happened?' },
  { k: 'idea', label: '💡 Idea', hint: 'A game, a feature, a new Crew character…' },
]

export function feedbackLink(kind: Kind, text: string, game?: string) {
  const head = `Lash vs Seven · ${kind === 'bug' ? 'Bug' : 'Idea'}${game ? `\nGame: ${game}` : ''}`
  return `https://wa.me/${FEEDBACK_TO}?text=${encodeURIComponent(`${head}\n\n${text.trim()}`)}`
}

/** A button that opens the feedback sheet. `game`: tags the message (from a result screen). */
export function FeedbackButton({ game, className = 'link-btn', children = 'Bug or idea?' }: { game?: string; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { play } = useSound()
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          play('tap')
          setOpen(true)
        }}
      >
        {children}
      </button>
      {open && <FeedbackSheet game={game} onClose={() => setOpen(false)} />}
    </>
  )
}

function FeedbackSheet({ game, onClose }: { game?: string; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('bug')
  const [text, setText] = useState('')
  const id = useId()
  const hint = KINDS.find((x) => x.k === kind)!.hint
  return (
    <Modal title="Send feedback" onClose={onClose}>
      <div className="feedback">
        <div className="seg" role="group" aria-label="What kind">
          {KINDS.map((x) => (
            <button key={x.k} type="button" className="seg__btn" aria-pressed={kind === x.k} onClick={() => setKind(x.k)}>
              {x.label}
            </button>
          ))}
        </div>
        <label className="label" htmlFor={id}>
          {game ? `About ${game}` : 'Tell us'}
        </label>
        <textarea id={id} className="feedback__text" value={text} onChange={(e) => setText(e.target.value)} placeholder={hint} rows={5} maxLength={1000} data-autofocus />
        <a
          className={`btn btn--primary btn--block${text.trim() ? '' : ' btn--off'}`}
          href={text.trim() ? feedbackLink(kind, text, game) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!text.trim()}
          onClick={() => text.trim() && onClose()}
        >
          Send on WhatsApp
        </a>
        <p className="hint">It opens WhatsApp with your message ready. Nothing is sent until you press send there.</p>
      </div>
    </Modal>
  )
}
