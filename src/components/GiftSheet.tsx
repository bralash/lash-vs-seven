import { onValue, ref, set } from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import { db, signIn } from '../lib/firebase'
import { useSound } from '../lib/sound'
import { Chip } from './Chip'
import { useChipFlight } from './ChipFlight'
import { Portal } from './Portal'
import '../styles/gift.css'

/*
 * Chips sent by the admin, with a message: wallets/{uid}/gifts/{id} = { n, msg, at, seen? }. The
 * chips are already in the wallet when the gift arrives; this card just says so, once. Shown on the
 * homepage, oldest first; "Thanks" flies the chips into the pile and marks the gift seen.
 */

export interface Gift {
  n: number
  msg: string
  at: number
  seen?: true
}

export function GiftSheet() {
  const [uid, setUid] = useState<string | null>(null)
  const [gifts, setGifts] = useState<Record<string, Gift>>({})
  const [closing, setClosing] = useState<string | null>(null)
  const { play } = useSound()
  const { fly, layer } = useChipFlight()
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    signIn()
      .then((id) => {
        if (!alive) return
        setUid(id)
        stop = onValue(ref(db, `wallets/${id}/gifts`), (s) => setGifts((s.val() as Record<string, Gift> | null) ?? {}), () => {})
      })
      .catch(() => {})
    return () => {
      alive = false
      stop?.()
    }
  }, [])

  const next = Object.entries(gifts)
    .filter(([id, g]) => !g.seen && id !== closing)
    .sort((a, b) => a[1].at - b[1].at)[0]

  const sounded = useRef<string | null>(null)
  useEffect(() => {
    if (next && sounded.current !== next[0]) {
      sounded.current = next[0]
      play('findBig')
    }
  }, [next, play])

  const thanks = (id: string, g: Gift) => {
    play('tap')
    fly(btn.current, document.querySelector('.corner__tile--chips'), g.n)
    setClosing(id)
    if (uid) set(ref(db, `wallets/${uid}/gifts/${id}/seen`), true).catch(() => {})
    setTimeout(() => setClosing((c) => (c === id ? null : c)), 1500)
  }

  return (
    <>
      {layer}
      {next && (
        <Portal>
          <div className="gift-back" role="presentation">
            <div className="gift" role="dialog" aria-labelledby="gift-title">
              <p className="gift__from">From Lash vs Seven</p>
              <h2 id="gift-title" className="gift__title">
                <Chip v={next[1].n >= 100 ? 100 : next[1].n >= 25 ? 25 : 5} size={46} />+{next[1].n.toLocaleString('en-GB')} chips
              </h2>
              {next[1].msg && <p className="gift__msg">{next[1].msg}</p>}
              <button ref={btn} type="button" className="btn btn--primary btn--block" onClick={() => thanks(next[0], next[1])}>
                Thanks!
              </button>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}
