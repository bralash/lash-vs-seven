import type { OpsStyle } from '../components/OpsFace'
import { KRATOPS_LINES } from '../components/faces/kratops'
import { OPSTIMUS_LINES } from '../components/faces/opstimus'
import { SPIDOPS_LINES } from '../components/faces/spidops'
import { THANOPS_LINES } from '../components/faces/thanops'

/*
 * What Ops says, per character. Every moment she speaks has a key; a character can give its own
 * lines for any of them (one is picked at random each time), and anything it leaves out falls back
 * to Ops' usual words. The face she pulls stays the same, only the words change.
 */

export type LineKey =
  // a match starts, by level
  | 'hello_easy' | 'hello_medium' | 'hello_hard'
  // a capture or a game won (took) / lost (lost), a lucky or unlucky roll or deal
  | 'took' | 'lost' | 'lucky' | 'unlucky'
  // how the game stands: crushing you, pulling ahead, losing badly, falling behind
  | 'crushing' | 'ahead' | 'losing' | 'behind'
  // your move: a blunder, a great one
  | 'blunder' | 'brilliant'
  // your turn and nothing happening
  | 'hurry' | 'sleep'
  // answers to the reactions you send (ahead/behind: how the game stands for her)
  | 'fire_ahead' | 'fire_behind' | 'fire_level' | 'lol_behind' | 'lol' | 'wow_ahead' | 'wow' | 'grr_ahead' | 'grr' | 'gg'
  | 'hurry_mine' | 'hurry_yours'
  // the match is over (hard: on the Hard level)
  | 'win_final_hard' | 'win_final' | 'lose_final_hard' | 'lose_final' | 'draw_final'
  // something thrown at her card, by how fed up she is; her throwing one back
  | 'hit_1' | 'hit_2' | 'hit_3' | 'throw_back'
  // her Ops goes over to taunt someone's card (taunt); yours comes to taunt hers (taunted)
  | 'taunt' | 'taunted'
  // you fired your ultimate at her
  | 'ulted'
  // poked, by how fed up she is; sulking; petted; the first poke on the results
  | 'poke_1' | 'poke_2' | 'poke_3' | 'poke_4' | 'poke_5' | 'poke_6' | 'sulk' | 'pet'
  | 'results_win' | 'results_lose' | 'results_draw'

export type Lines = Partial<Record<LineKey, string[]>>

const BY_LOOK: Partial<Record<OpsStyle, Lines>> = { warrior: KRATOPS_LINES, titan: THANOPS_LINES, spider: SPIDOPS_LINES, prime: OPSTIMUS_LINES }

export const linesFor = (look: OpsStyle): Lines => BY_LOOK[look] ?? {}

/** The character's own line for this moment if it has one, else Ops' usual words. */
export function lineFor(lines: Lines, key: LineKey | undefined, usual: string) {
  const own = key && lines[key]
  return own && own.length ? own[Math.floor(Math.random() * own.length)] : usual
}
