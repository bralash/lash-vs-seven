import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Close } from './Icons'
import { Portal } from './Portal'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Parents often pass an inline onClose; keep the latest without re-running setup on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    // An element marked data-autofocus (e.g. the safe choice in a confirm) wins over the close button.
    const preferred = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')
    ;(preferred ?? closeRef.current)?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  return (
    <Portal lockScroll>
      <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="modal__head">
            <h2 id={titleId}>{title}</h2>
            <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Close />
            </button>
          </div>
          <div className="modal__body">{children}</div>
        </div>
      </div>
    </Portal>
  )
}
