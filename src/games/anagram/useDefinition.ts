import { useEffect, useState } from 'react'

export interface Definition {
  pos: string
  text: string
}

// Free, keyless sources, tried in order. Each gets a short timeout so a slow or dead one
// (dictionaryapi.dev has been down for days at a time) never holds up the reveal.
type Provider = (word: string) => Promise<Definition | null>

const POS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: '' }
const MAX = 170

const tidy = (s: string) => {
  const t = s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // drop leading usage labels like "(intransitive)" or "(architecture, dated)"
    .replace(/^(\([^)]*\)\s*)+/, '')
  return t.length > MAX ? `${t.slice(0, MAX - 1).trimEnd()}…` : t
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3500) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

/** Datamuse (WordNet definitions). Returns e.g. "n\tAn implement consisting of …". */
const datamuse: Provider = async (word) => {
  const data = await getJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(word.toLowerCase())}&md=d&max=1`)
  const entry = data?.[0]
  if (!entry || entry.word?.toUpperCase() !== word) return null
  const raw: string | undefined = entry.defs?.[0]
  if (!raw) return null
  const [pos, ...rest] = raw.split('\t')
  return { pos: POS[pos] ?? '', text: tidy(rest.join(' ')) }
}

/** Wiktionary REST API — definitions come back as HTML, so tags are stripped. */
const wiktionary: Provider = async (word) => {
  const data = await getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.toLowerCase())}`)
  for (const section of data?.en ?? []) {
    const def = (section.definitions ?? []).map((d: { definition: string }) => tidy(d.definition)).find(Boolean)
    if (def) return { pos: String(section.partOfSpeech ?? '').toLowerCase(), text: def }
  }
  return null
}

/** The original game's source; kept as a last resort in case it comes back. */
const freeDictionary: Provider = async (word) => {
  const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`)
  const meaning = data?.[0]?.meanings?.[0]
  const text: string | undefined = meaning?.definitions?.[0]?.definition
  return text ? { pos: meaning.partOfSpeech ?? '', text: tidy(text) } : null
}

const PROVIDERS = [datamuse, wiktionary, freeDictionary]

// One lookup per word per session (including "no definition found").
const cache = new Map<string, Promise<Definition | null>>()

export function lookupDefinition(word: string): Promise<Definition | null> {
  let p = cache.get(word)
  if (!p) {
    p = (async () => {
      for (const provider of PROVIDERS) {
        try {
          const def = await provider(word)
          if (def?.text) return def
        } catch {
          /* try the next source */
        }
      }
      return null
    })()
    cache.set(word, p)
  }
  return p
}

/** Start fetching early (e.g. when a round begins) so the definition is ready by the reveal. */
export function prefetchDefinition(word: string | undefined) {
  if (word) lookupDefinition(word)
}

/** Short dictionary definition for the reveal screen — decorative, so failures just show nothing. */
export function useDefinition(word: string | undefined) {
  const [def, setDef] = useState<Definition | null>(null)
  useEffect(() => {
    setDef(null)
    if (!word) return
    let alive = true
    lookupDefinition(word).then((d) => alive && setDef(d))
    return () => {
      alive = false
    }
  }, [word])
  return def
}
