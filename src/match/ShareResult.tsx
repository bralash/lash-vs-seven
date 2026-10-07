import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'
import { drawShareCard, type CardInput } from './shareCard'

interface Props {
  card: CardInput
  /** text sent alongside the image, e.g. "Emmanuel beat Seven 2–1 at Tic-Tac-Toe" */
  message: string
  /** winners get the loud button; everyone else a quieter one */
  won: boolean
}

/** "Share your win" → preview of the result card, then the phone's share sheet (or download / copy). */
export function ShareResult({ card, message, won }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`btn${won ? ' btn--primary' : ''} share-btn`} onClick={() => setOpen(true)}>
        <ShareIcon /> {won ? 'Share your win' : 'Share result'}
      </button>
      {open && <ShareDialog card={card} message={message} onClose={() => setOpen(false)} />}
    </>
  )
}

function ShareDialog({ card, message, onClose }: { card: CardInput; message: string; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    let made: string | null = null
    drawShareCard(card)
      .then((b) => {
        if (!alive) return
        made = URL.createObjectURL(b)
        setBlob(b)
        setUrl(made)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [card])

  const fileName = `lash-vs-seven-${card.game.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null
  const canShareFile = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const canCopy = !!blob && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write

  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], text: message })
    } catch {
      /* the person closed the share sheet */
    }
  }
  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setNote('Saved to your downloads')
  }
  const copy = async () => {
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setNote('Image copied — paste it into a chat')
    } catch {
      setNote('Couldn’t copy here — use Download instead')
    }
  }

  return (
    <Modal title="Your result card" onClose={onClose}>
      <div className="share">
        <div className="share__preview" aria-busy={!url}>
          {url ? <img src={url} alt="Result card" /> : <p className="hint">{failed ? 'Couldn’t draw the card' : 'Drawing your card…'}</p>}
        </div>
        <div className="share__actions">
          {canShareFile && (
            <button type="button" className="btn btn--primary" onClick={share} data-autofocus>
              <ShareIcon /> Share
            </button>
          )}
          <button type="button" className={`btn${canShareFile ? '' : ' btn--primary'}`} onClick={download} disabled={!url}>
            Download
          </button>
          {canCopy && (
            <button type="button" className="btn" onClick={copy}>
              Copy image
            </button>
          )}
        </div>
        <p className="hint share__note" role="status">{note}</p>
      </div>
    </Modal>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
      <path d="M12 3v13M6 9l6-6 6 6" />
      <path d="M4 14v7h16v-7" />
    </svg>
  )
}
