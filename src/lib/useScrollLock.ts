import { useEffect } from 'react'

/** Whether `el` or something above it (inside the page) can still scroll the way the finger is going. */
function scrollsInside(el: Element | null, dx: number, dy: number): boolean {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return true
    } else if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true
  }
  return false
}

/**
 * Pins the page while `active`: no scrolling, panning or rubber-band bounce.
 * Applied to <html> as well as <body> because iOS Safari ignores body-only overflow rules.
 *
 * iOS (Safari and Chrome alike) still lets a swipe move the page now and then despite
 * overflow: hidden, and that collapses the browser's toolbar: the viewport grows, every board
 * sized from 100dvh resizes mid-round, and WebKit can leave the old board painted underneath the
 * new one (stray tiles and frames all over the screen). So a swipe that nothing inside the page
 * can scroll is stopped outright, and if the page moves anyway it's put straight back.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    window.scrollTo(0, 0)
    const root = document.documentElement
    root.classList.add('scroll-locked')

    let start: { x: number; y: number } | null = null
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start = t ? { x: t.clientX, y: t.clientY } : null
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return // pinch zoom stays the browser's
      const t = e.touches[0]
      if (!t || !start) return
      const dx = start.x - t.clientX
      const dy = start.y - t.clientY
      if (!scrollsInside(e.target as Element, dx, dy) && e.cancelable) e.preventDefault()
    }
    const snapBack = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('scroll', snapBack, { passive: true })
    window.visualViewport?.addEventListener('resize', snapBack)
    return () => {
      root.classList.remove('scroll-locked')
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      window.removeEventListener('scroll', snapBack)
      window.visualViewport?.removeEventListener('resize', snapBack)
    }
  }, [active])
}
