import { onValue, ref } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import { OpsFace, asLook } from '../components/OpsFace'
import { asWear } from '../components/faces/wardrobe'
import { Portal } from '../components/Portal'
import { db } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { roomPath, type Watcher } from '../lobby/rooms'
import { reactionOf } from './Reactions'

/*
 * People watching an online match. Everyone in a watched room (players and watchers) sees an eye
 * chip with how many are watching; players always have it during a match, so they can open it and
 * invite someone to watch (the room's link, shared or copied), and the watchers' reactions as small stickers along the bottom,
 * apart from the players' own. Watchers write their latest reaction to
 * matches/{game}/{code}/wreact/{uid}, the way players use react/.
 */

const SHOW_MS = 2400

interface Cheer {
  id: number
  who: string
  e: string
  said: string
}

export function Spectators({
  game,
  code,
  pid,
  watchers,
  invite,
}: {
  game: string
  code: string
  pid: string
  watchers?: Record<string, Watcher>
  /** a player in the match: the room's link to send someone, and the game's name for the message */
  invite?: { url: string; name: string }
}) {
  const list = Object.entries(watchers ?? {}).sort(([, a], [, b]) => (a.at ?? 0) - (b.at ?? 0))
  const [open, setOpen] = useState(false)
  const [cheers, setCheers] = useState<Cheer[]>([])
  const nextId = useRef(0)
  const seen = useRef<Record<string, number> | null>(null)
  const namesRef = useRef(watchers)
  namesRef.current = watchers
  const { play } = useSound()
  const [copied, setCopied] = useState(false)

  // the phone's share sheet where there is one, otherwise the link goes on the clipboard
  const sendInvite = async () => {
    if (!invite) return
    play('tap')
    const text = `Watch my ${invite.name} match on Lash vs Seven`
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: invite.url })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(invite.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch {
      /* no clipboard: the link is on screen to copy by hand */
    }
  }

  useEffect(
    () =>
      onValue(ref(db, `${roomPath(game, code)}/wreact`), (snap) => {
        const all = (snap.val() ?? {}) as Record<string, { k: string; n: number }>
        const before = seen.current
        seen.current = Object.fromEntries(Object.entries(all).map(([u, r]) => [u, r.n]))
        if (!before) return // what was already there when we arrived isn't news
        for (const [u, r] of Object.entries(all)) {
          const known = reactionOf(r.k)
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

  if (!list.length && !cheers.length && !invite) return null
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
        {(list.length > 0 || invite) && (
          <button
            type="button"
            className="watch__chip"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={list.length ? `${list.length} watching` : 'Invite someone to watch'}
          >
            <span aria-hidden="true">👁</span> {list.length > 0 ? list.length : invite && <span className="watch__plus">+</span>}
          </button>
        )}
        {open && (list.length > 0 || invite) && (
          <>
            <button type="button" className="react__scrim" aria-label="Close" onClick={() => setOpen(false)} />
            <div className="watch__list" role="dialog" aria-label="Watching">
              <p className="label">{list.length ? 'Watching' : 'Nobody’s watching yet'}</p>
              {list.length > 0 && (
                <ul>
                  {list.map(([id, w]) => (
                    <li key={id}>
                      <OpsFace size={28} look={asLook(w.look) ?? 'screen'} wear={asWear(w.wear)} />
                      <span>{w.name}</span>
                      {id === pid && <span className="seat__you">You</span>}
                    </li>
                  ))}
                </ul>
              )}
              {invite && (
                <div className="watch__invite">
                  <button type="button" className="btn btn--primary btn--block" onClick={sendInvite}>
                    {copied ? 'Link copied' : 'Invite to watch'}
                  </button>
                  <p className="watch__invite-note">They can watch, hear your voice notes and cheer, but never see your cards or moves before you make them.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Portal>
  )
}
