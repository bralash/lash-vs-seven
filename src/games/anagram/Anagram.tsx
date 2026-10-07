import { useEffect } from 'react'
import { loadDictionary } from '../../lib/dictionary'
import { Lobby } from '../../lobby/Lobby'
import { gameBySlug } from '../registry'
import { AnagramMatch, initialAnagramState } from './AnagramMatch'

const game = gameBySlug('anagram')!

export function Anagram() {
  // fetch the full word list while players are still in the lobby
  useEffect(() => {
    loadDictionary()
  }, [])

  return (
    <Lobby
      game={game}
      initialState={() => ({ ...initialAnagramState() })}
      renderGame={(room, me, exit) => <AnagramMatch room={room} me={me} exit={exit} />}
    />
  )
}
