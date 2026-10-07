import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders into <body> so fixed-position overlays cover the whole viewport.
 * (Any ancestor with a transform — e.g. a screen entrance animation — would otherwise
 * become the containing block and clip a `position: fixed` child.)
 */
export function Portal({ children, lockScroll = false }: { children: ReactNode; lockScroll?: boolean }) {
  useEffect(() => {
    if (!lockScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [lockScroll])
  return createPortal(children, document.body)
}
