import { useEffect, useRef } from 'react'
import type { OpsMood } from '../components/OpsFace'
import { useSound } from '../lib/sound'
import { BOT_NAME, type Level, type Moment, type OpsSense } from './bot'
import { Pops, ReactionButton, usePops, useSend, type ReactionKey } from './Reactions'
import { itemFrom, launch, ThrowLayer, type Item } from './Throws'

/*
 * Ops reacts the way a person does in an online match: a sticker pops up with her name and a
 * word, only with her face pulling the mood instead of an emoji. She speaks up at big moments
 * only (a swing in who's ahead, a capture, a game won or lost, you taking ages) and answers the
 * reactions you send her.
 */

type Say = { face: OpsMood; said: string }

/** quiet for at least this long between unprompted reactions */
const GAP_MS = 8000
/** …and even then she lets some moments pass, so it doesn't feel scripted */
const CHANCE = 0.7
/** your turn: she glances at the clock after this long, then dozes off */
const WAIT_MS = 15_000
const SLEEP_MS = 45_000
/** how big a one-move swing in standing counts as a blunder or a great move */
const SWING = 0.45

const HELLO: Record<Level, Say> = {
  easy: { face: 'hello', said: 'Hi!' },
  medium: { face: 'hello', said: 'Let’s go' },
  hard: { face: 'hello', said: 'Bring it' },
}

const MOMENT: Record<Moment, Say> = {
  took: { face: 'gotcha', said: 'Mine' },
  lost: { face: 'ouch', said: 'Rude' },
  lucky: { face: 'lucky', said: 'Yes!' },
  unlucky: { face: 'unlucky', said: 'Rigged' },
}

/** where a standing sits: −2 losing badly, −1 behind, 0 level, 1 ahead, 2 crushing */
const band = (s: number) => (s >= 0.6 ? 2 : s >= 0.25 ? 1 : s <= -0.6 ? -2 : s <= -0.25 ? -1 : 0)

/** what a new band makes her say, if anything */
function bandSay(from: number, to: number): Say | null {
  if (to === from) return null
  if (to === 2) return { face: 'sorry', said: 'Sorry…' }
  if (to === 1 && from < 1) return { face: 'smug', said: 'Hehe' }
  if (to === -2) return { face: 'panic', said: 'No no no' }
  if (to === -1 && from > -1) return { face: 'nervous', said: 'Uh oh' }
  return null
}

/** Her answer to a reaction you send, given how the game stands (s, from her side) and whose turn it is. */
function reply(k: ReactionKey, s: number, herTurn: boolean): Say {
  switch (k) {
    case 'fire':
      return s >= 0.25 ? { face: 'smug', said: 'Cute' } : s <= -0.25 ? { face: 'nervous', said: 'Uh oh' } : { face: 'smug', said: 'We’ll see' }
    case 'lol':
      return s <= -0.25 ? { face: 'ouch', said: 'Rude' } : { face: 'smug', said: 'Hehe' }
    case 'wow':
      return s >= 0.25 ? { face: 'sorry', said: 'Sorry…' } : { face: 'wow', said: 'Me too' }
    case 'grr':
      return s >= 0.25 ? { face: 'gotcha', said: 'Mine' } : { face: 'pity', said: 'Easy now' }
    case 'gg':
      return { face: 'gg', said: 'GG' }
    case 'hurry':
      return herTurn ? { face: 'think', said: 'Patience' } : { face: 'wait', said: 'Your go!' }
  }
}

/**
 * Something thrown at her card, by how fed up she is (the index; like a poke, it wears off). Past
 * the last row she throws one back.
 */
const HITS: Record<Item, Say[]>[] = [
  { tomato: [{ face: 'ouch', said: 'Eww' }, { face: 'wow', said: 'A tomato?!' }], rock: [{ face: 'ouch', said: 'Ow!' }, { face: 'ouch', said: 'Bonk' }], paper: [{ face: 'giggle', said: 'Missed… no wait' }, { face: 'smug', said: 'That tickled' }], axe: [{ face: 'panic', said: 'AN AXE?!' }, { face: 'wow', said: 'Is that… mine?' }] },
  { tomato: [{ face: 'salty', said: 'My face!' }, { face: 'salty', said: 'Rude' }], rock: [{ face: 'salty', said: 'Hey!' }, { face: 'nervous', said: 'That hurt' }], paper: [{ face: 'salty', said: 'Really?' }, { face: 'nervous', said: 'Okay, okay' }], axe: [{ face: 'nervous', said: 'Not the axe' }, { face: 'salty', said: 'Overkill' }] },
  { tomato: [{ face: 'angry', said: 'Stop that' }], rock: [{ face: 'angry', said: 'Seriously?' }], paper: [{ face: 'angry', said: 'Quit it' }], axe: [{ face: 'angry', said: 'ENOUGH' }] },
]
const AXE_BACK: Say[] = [{ face: 'gotcha', said: 'BOY.' }, { face: 'smug', said: 'Catch' }, { face: 'gotcha', said: 'Axe time' }]
const BACK: Say[] = [{ face: 'gotcha', said: 'Take that' }, { face: 'smug', said: 'Your turn' }, { face: 'gotcha', said: 'Ha!' }]
/** every this long without a throw takes one off how fed up she is */
const HIT_COOL_MS = 4000
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** What she says when a game ends. */
function endSay(winner: 0 | 1 | -1, final: boolean, level: Level): Say | null {
  if (!final) return winner === 1 ? MOMENT.took : winner === 0 ? MOMENT.lost : null
  if (winner === 0) return level === 'hard' ? { face: 'salty', said: 'Again?' } : { face: 'gg', said: 'GG' }
  if (winner === 1) return level === 'hard' ? { face: 'smug', said: 'Too easy' } : { face: 'gg', said: 'GG' }
  return { face: 'gg', said: 'GG' }
}

/**
 * The reaction button and stickers for a match against Ops. Mount it fresh for each match (key it
 * by the match's start) so she says hello once.
 */
export function OpsReactions({ sense, state, level }: { sense: OpsSense; state: Record<string, unknown>; level: Level }) {
  const { pops, pop } = usePops()
  const { play } = useSound()
  const saidAt = useRef(0)
  const prev = useRef<{ state: Record<string, unknown>; key: string; standing: number | null } | null>(null)
  const replyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stateRef = useRef(state)
  stateRef.current = state

  const say = (s: Say, buzz = true) => {
    saidAt.current = Date.now()
    pop({ mine: false, face: s.face, said: s.said })
    play('tap')
    if (buzz) navigator.vibrate?.(40)
  }
  /** an unprompted reaction: only when she's been quiet a while, and not always */
  const maybe = (s: Say | null) => {
    if (s && Date.now() - saidAt.current >= GAP_MS && Math.random() < CHANCE) say(s)
  }
  const sayRef = useRef(say)
  sayRef.current = say
  const maybeRef = useRef(maybe)
  maybeRef.current = maybe

  // hello, once the board is up
  useEffect(() => {
    const t = setTimeout(() => sayRef.current(HELLO[level], false), 900) // no buzz: the page may not have been tapped yet
    return () => {
      clearTimeout(t)
      clearTimeout(replyTimer.current)
    }
  }, [level])

  // each move: a finished game, a capture, a blunder or a great move, or a swing in who's ahead
  const key = sense.key?.(state) ?? `${state.match}:${JSON.stringify(state.live)}`
  useEffect(() => {
    const was = prev.current
    const standing = sense.standing(state)
    prev.current = { state, key, standing }
    if (!was || was.key === key) return

    const end = sense.ended(state)
    if (end) {
      if (!sense.ended(was.state)) {
        const s = endSay(end.winner, end.final, level)
        if (s) say(s) // always worth a word
      }
      return
    }
    if (standing === null || was.standing === null) return
    const youMoved = sense.turn(was.state) === 0
    const moment = sense.moment?.(was.state, state)
    const swing = standing - was.standing
    maybe(
      (moment && (typeof moment === 'string' ? MOMENT[moment] : { face: MOMENT[moment.moment].face, said: moment.said })) ||
        (youMoved && swing >= SWING ? { face: 'pity', said: 'Oof' } : null) ||
        (youMoved && swing <= -SWING ? { face: 'wow', said: 'No way' } : null) ||
        bandSay(band(was.standing), band(standing)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // your turn and nothing happening: she glances at the clock, then nods off
  const yourTurn = sense.turn(state) === 0 && !sense.ended(state)
  useEffect(() => {
    if (!yourTurn) return
    const a = setTimeout(() => maybeRef.current({ face: 'wait', said: 'Hurry up' }), WAIT_MS)
    const b = setTimeout(() => sayRef.current({ face: 'sleep', said: 'Zzz' }), SLEEP_MS)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [yourTurn, key])

  // you throw something at her card: a word back, and if you keep it up, something back
  const fed = useRef({ count: 0, at: 0 })
  const backTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(backTimer.current), [])
  const onHit = ({ to, mine, item }: { to: string; mine: boolean; item: Item }) => {
    if (to !== 'p1' || !mine) return
    const f = fed.current
    const now = Date.now()
    f.count = Math.max(0, f.count - Math.floor((now - f.at) / HIT_COOL_MS)) + 1
    f.at = now
    const row = Math.ceil(f.count / 2) - 1
    if (row < HITS.length) {
      sayRef.current(pick(HITS[row][item]))
      return
    }
    f.count = 0
    clearTimeout(backTimer.current)
    backTimer.current = setTimeout(() => {
      const item = itemFrom('p1')
      launch('p1', 'p0', item)
      sayRef.current(item === 'axe' ? pick(AXE_BACK) : pick(BACK))
    }, 700)
  }

  // you react, she answers a moment later
  const send = useSend(pop, (k) => {
    clearTimeout(replyTimer.current)
    replyTimer.current = setTimeout(() => {
      const now = stateRef.current
      sayRef.current(reply(k, sense.standing(now) ?? 0, sense.turn(now) === 1))
    }, 900 + Math.random() * 600)
  })

  return (
    <div className="react">
      <ReactionButton onPick={send} />
      <Pops pops={pops} other={BOT_NAME} />
      <ThrowLayer me="p0" onHit={onHit} />
    </div>
  )
}
