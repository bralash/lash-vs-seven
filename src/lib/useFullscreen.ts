import { useCallback, useEffect, useState } from 'react'

// Safari (iPad) still only has the webkit-prefixed API; iPhone has none for pages at all.
type Doc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> }
type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
const doc = () => document as Doc
const current = () => !!(doc().fullscreenElement ?? doc().webkitFullscreenElement)

/**
 * Fullscreen for a match: `supported` is false where the browser can't do it (e.g. iPhone), so
 * the button can stay hidden. While on, <html> has `is-fullscreen` so boards can grow into the space.
 * `active` false (the match ended / you left) drops out of fullscreen.
 */
export function useFullscreen(active: boolean) {
  const supported = typeof document !== 'undefined' && !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled)
  const [on, setOn] = useState(current)

  useEffect(() => {
    const sync = () => {
      setOn(current())
      document.documentElement.classList.toggle('is-fullscreen', current())
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const exit = useCallback(() => {
    if (!current()) return
    const d = doc()
    ;(d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)?.catch(() => {})
  }, [])

  useEffect(() => {
    if (!active) exit()
    return exit
  }, [active, exit])

  const toggle = useCallback(() => {
    if (current()) return exit()
    const el = document.documentElement as El
    ;(el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el)?.catch(() => {})
  }, [exit])

  return { supported, on, toggle }
}
