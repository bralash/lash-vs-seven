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
  /** the second player's name in pass-and-play */
  name2: 'lvs_name_1',
  /** last level picked for Ops */
  botLevel: 'lvs_bot_level',
  sound: 'lvs_sound',
  /** the face this player picked for Ops (/ops) */
  opsLook: 'lvs_ops_look',
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
