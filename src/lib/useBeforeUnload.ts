import { useEffect } from 'react'

/** Ask the browser to confirm refresh / tab close while `active` (it shows its own generic dialog). */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // still required by some browsers
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
