# Rivalry record — plan

Agreed with the user (2026-10-07) instead of a global leaderboard: the site is literally *Lash vs Seven*, so the
record that matters is **you vs this one person**. No accounts, no public ranking, nothing to cheat for.

## What players see
- **Results screen** (every game, online and pass & play): one line under the score — "You lead Seven 7–5 all-time",
  "Seven leads 5–3", "All square at 4–4", plus a streak when it's 2+ ("3 in a row").
- **Share card**: the same all-time line in the headline area, e.g. "EMMANUEL 7 — 5 SEVEN · ALL-TIME".
- **Per-game split** (small, on results): "Checkers 4–1 · Word Hunt 2–6".
- Later (optional): a "Your rivals" strip on the homepage.

## How it's stored
- **Per device, in localStorage** (`lvs_rivals`). Both players' devices record the same results, so they agree.
  No database rules needed; switching phones starts a fresh record (acceptable).
- **Key**: online → the opponent's anonymous uid (keep their latest name for display);
  pass & play → `local:` + the two names sorted (no uids on one device).
- **Shape**: `{ [key]: { name, total: {w,l,d}, byGame: {[slug]: {w,l,d}}, streak: {who: 'me'|'them', n}, updatedAt } }`.
  Pass & play stores from player 1's point of view.
- **Record once per finished match**: dedupe by `${roomCode}:${matchNumber}` (keep the last ~200 ids). A match that
  ends by abandonment doesn't count.

## Code
- `src/match/rivalry.ts` — load/save, `recordResult({ game, key, name, outcome, matchId })`, `describe(record)` → strings.
- `src/match/useRivalry.ts` — hook used by every game's `Results`: records on mount (once), returns the line(s) to show.
- Wire into all Results screens: wordhunt, anagram, tictactoe, connect4, dots, othello, sudoku, checkers
  (Sudoku pass & play: winner = faster time; draws count as draws).
- Share card: pass the line through `CardInput` (new optional `rivalry?: string`), drawn under the headline.

## Test
- Unit-ish: record wins/losses/draws, dedupe on re-render/refresh, streak flips.
- Two-tab online match ×2 (rematch) → both tabs show matching records; pass & play match → local key.

## Feats (added 2026-10-08, Battleship first)
Brag-worthy moments kept per rival on the same record (`Rival.feats[id] = { me, them }`: matches each side earned it in).
- Each game defines its feats in `src/games/<game>/feats.ts` (`FeatDef[]` + a function that reads the finished match
  and returns the feat ids earned by each seat), and registers the list in `src/match/feats.ts`.
- Results pass them as the last argument of `useRivalry(…, feats)`; `RivalryLine` shows them as tags
  ("UNTOUCHED · You · first vs Seven", yellow the first time) and tapping one shows what it takes.
- The homepage rival card lists them when opened ("Untouched — You ×2 · Seven ×1").
- Add a "Feats" step to the game's rules in the registry so players know what to aim for.
