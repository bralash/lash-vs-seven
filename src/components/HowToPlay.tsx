import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RuleStep } from '../games/registry'
import { Modal } from './Modal'

/** A game's walk-through: plays above the rules and says which rule it's showing. */
export type RulesDemo = (onRule: (rule: number) => void) => ReactNode

export function HowToPlay({ rules, demo, onClose }: { rules: RuleStep[]; demo?: RulesDemo; onClose: () => void }) {
  const [showing, setShowing] = useState<number | null>(null)
  const list = useRef<HTMLOListElement>(null)
  // keep the rule being shown in view (on phones the later rules sit below the fold)
  useEffect(() => {
    if (showing === null) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    list.current?.children[showing]?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [showing])
  return (
    <Modal title="How to play" onClose={onClose}>
      {demo && <div className="rules-demo">{demo(setShowing)}</div>}
      <ol className="steps" ref={list}>
        {rules.map((r, i) => (
          <li key={r.title} className={showing === i ? 'steps__on' : undefined}>
            <span className="num" aria-hidden="true">{i + 1}</span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
