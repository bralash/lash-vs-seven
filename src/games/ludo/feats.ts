import type { FeatDef } from '../../match/feats'
import type { Live } from './engine'

export const LUDO_FEATS: FeatDef[] = [
  { id: 'ludo:clean', game: 'ludo', name: 'Clean run', blurb: 'Won without a single token kicked back to the yard.' },
  { id: 'ludo:revenge', game: 'ludo', name: 'Revenge', blurb: 'Kicked back the player who had just kicked you.' },
]

/**
 * The feats each seat (0–3) earned in a finished game. Clean run needs the game's feat tracking from
 * the start (`fx` — an older game without it can't tell, so it gives none). Revenge is defined on `Fx`
 * in engine.ts.
 */
export function ludoFeats(live: Live): string[][] {
  const out: string[][] = [[], [], [], []]
  const fx = live.fx
  if (!fx) return out
  const w = live.winner
  if (w !== undefined && w >= 0 && !((fx.hit ?? 0) & (1 << w))) out[w].push('ludo:clean')
  for (let s = 0; s < 4; s++) if ((fx.rev ?? 0) & (1 << s)) out[s].push('ludo:revenge')
  return out
}
