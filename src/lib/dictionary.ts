// The big "is this a real word?" list: ENABLE (public domain), trimmed to 3–8 letters, ~80k words.
// Served as a static file and fetched once when a word game opens, so the homepage stays light.
// Until it arrives (or if it fails), games fall back to their own curated lists.

const URL = '/dict/enable-3-8.txt'

let words: Set<string> | null = null
let loading: Promise<void> | null = null

export function loadDictionary(): Promise<void> {
  loading ??= fetch(URL)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((text) => {
      words = new Set(text.split('\n').filter(Boolean).map((w) => w.toUpperCase()))
    })
    .catch(() => {
      loading = null // allow a retry next time a game opens
    })
  return loading
}

/** True if the full dictionary is loaded and contains `word` (uppercase). */
export function inDictionary(word: string) {
  return words?.has(word) ?? false
}

export function dictionaryReady() {
  return words !== null
}

const byLength = new Map<number, string[]>()
/** Every dictionary word of this length, or null until the dictionary has loaded. */
export function wordsOfLength(n: number): string[] | null {
  if (!words) return null
  let list = byLength.get(n)
  if (!list) {
    list = [...words].filter((w) => w.length === n)
    byLength.set(n, list)
  }
  return list
}
