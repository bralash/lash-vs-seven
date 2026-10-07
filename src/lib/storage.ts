// localStorage can throw (private mode, blocked site data) — never let that break the app.
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

// Same keys as the legacy site so returning players keep their name and sound setting.
export const KEYS = {
  name: 'lvs_name_0',
  sound: 'lvs_sound',
} as const


/** Per-tab flag for "I chose to leave this room", so Back/refresh doesn't silently rejoin. */
export function markLeft(game: string, code: string | null) {
  try {
    if (code) sessionStorage.setItem('lvs_left', `${game}:${code}`)
    else sessionStorage.removeItem('lvs_left')
  } catch {
    /* ignore */
  }
}
export function hasLeft(game: string, code: string) {
  try {
    return sessionStorage.getItem('lvs_left') === `${game}:${code}`
  } catch {
    return false
  }
}
