import { useEffect, useState } from 'react'
import { codeOf, signIn } from '../lib/firebase'
import { useSound } from '../lib/sound'

/** "Your code: 3F9A1", so a player can tell the admin exactly who they are (to be sent chips). */
export function PlayerCode() {
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { play } = useSound()
  useEffect(() => {
    signIn()
      .then((uid) => setCode(codeOf(uid)))
      .catch(() => {})
  }, [])
  if (!code) return null
  const copy = () => {
    play('tap')
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }
  return (
    <p className="player-code">
      Your code <b>{code}</b>
      <button type="button" className="player-code__copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </p>
  )
}
