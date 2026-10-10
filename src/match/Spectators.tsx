import { onValue, ref } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import { OpsFace, asLook } from '../components/OpsFace'
import { asWear } from '../components/faces/wardrobe'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { roomPath, type Watcher } from '../lobby/rooms'
import { REACTIONS } from './Reactions'

/*
 * People watching an online match. Everyone in a watched room (players and watchers) sees an eye
 * chip with how many are watching, and the watchers' reactions as small stickers along the bottom,
 * apart from the players' own. Watchers write their latest reaction to
 * matches/{game}/{code}/wreact/{uid}, the way players use react/.
 */

const BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.k, r])) as Record<string, (typeof REACTIONS)[number]>
const SHOW_MS = 2400

interface Cheer {
  id: number
  who: string
  e: string
  said: string
}

export function Spectators({ game, code, pid, watchers }: { game: string; code: string; pid: string; watchers?: Record<string, Watcher> }) {
  const list = Object.entries(watchers ?? {}).sort(([, a], [, b]) => (a.at ?? 0) - (b.at ?? 0))
  const [open, setOpen] = useState(false)
  const [cheers, setCheers] = useState<Cheer[]>([])
  const nextId = useRef(0)
  const seen = useRef<Record<string, number> | null>(null)
  const namesRef = useRef(watchers)
  namesRef.current = watchers
  const { play } = useSound()

  useEffect(
    () =>
      onValue(ref(db, `${roomPath(game, code)}/wreact`), (snap) => {
        const all = (snap.val() ?? {}) as Record<string, { k: string; n: number }>
        const before = seen.current
        seen.current = Object.fromEntries(Object.entries(all).map(([u, r]) => [u, r.n]))
        if (!before) return // what was already there when we arrived isn't news
        for (const [u, r] of Object.entries(all)) {
          const known = BY_KEY[r.k]
          if (r.n === before[u] || !known) continue
          const id = nextId.current++
          const who = u === pid ? 'You' : (namesRef.current?.[u]?.name ?? 'Someone watching')
          setCheers((c) => [...c.slice(-3), { id, who, e: known.e, said: known.label }])
          setTimeout(() => setCheers((c) => c.filter((x) => x.id !== id)), SHOW_MS)
          if (u !== pid) play('tap')
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, code, pid],
  )

  // Escape closes the list
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!list.length && !cheers.length) return null
  return (
    <Portal>
      <div className="watch">
        <div className="watch__cheers" aria-live="polite">
          {cheers.map((c) => (
            <div key={c.id} className="watch__cheer">
              <span className="watch__emoji" aria-hidden="true">{c.e}</span>
              <span className="watch__who">{c.who}</span>
            </div>
          ))}
        </div>
        {list.length > 0 && (
          <button type="button" className="watch__chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${list.length} watching`}>
            <span aria-hidden="true">👁</span> {list.length}
          </button>
        )}
        {open && list.length > 0 && (
          <>
            <button type="button" className="react__scrim" aria-label="Close" onClick={() => setOpen(false)} />
            <div className="watch__list" role="dialog" aria-label="Watching">
              <p className="label">Watching</p>
              <ul>
                {list.map(([id, w]) => (
                  <li key={id}>
                    <OpsFace size={28} look={asLook(w.look) ?? 'screen'} wear={asWear(w.wear)} />
                    <span>{w.name}</span>
                    {id === pid && <span className="seat__you">You</span>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </Portal>
  )
}
