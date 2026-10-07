import type { RuleStep } from '../games/registry'
import { Modal } from './Modal'

export function HowToPlay({ rules, onClose }: { rules: RuleStep[]; onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose}>
      <ol className="steps">
        {rules.map((r, i) => (
          <li key={r.title}>
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
