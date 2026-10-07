import { useEffect } from 'react'

/**
 * Pins the page while `active`: no scrolling, panning or rubber-band bounce.
 * Applied to <html> as well as <body> because iOS Safari ignores body-only overflow rules.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    window.scrollTo(0, 0)
    document.documentElement.classList.add('scroll-locked')
    return () => document.documentElement.classList.remove('scroll-locked')
  }, [active])
}
