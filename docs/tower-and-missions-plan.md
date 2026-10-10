# Weekly missions and Ops' Tower — plan

Planned 2026-10-10. Two features to make the app more fun to come back to: **weekly missions**
(small goals that pay chips) and **Ops' Tower** (a single-player climb against the Crew, with Ops
as the boss). Missions come first: they're quicker, and "Clear floor 3 of the Tower" can later be a
mission.

Build it **one session per step** (see "Build order" at the end). Each step ends with a commit and
deploy, and with the step's status ticked in this file.

> All four decisions were settled with the user on 2026-10-10 (see "Decisions" at the end).

---

## 1. Weekly missions

### How it works

- **Three missions a week, the same for everyone**, so friends can race each other ("I've got 8 of
  10 kicks"). Reset every **Monday 00:00 Ghana time (UTC)**.
- **Pay:** easy **30** chips, medium **60**, hard **120**, plus **90** for finishing all three
  (300 a week in all; trimmed from 500 so characters at 300–800 stay a goal. For scale: a win
  against a friend pays 25).
- **What counts:**
  - online matches with friends: everything
  - against Ops: only Ops missions ("Beat Ops on Hard")
  - pass & play: nothing (nobody can farm alone on one phone)
  - watching: nothing
- **Where it shows:**
  - **Homepage:** a "This week" tile with three progress bars and "ends in 3 days"; tap it for the
    list (each mission's name, blurb, progress and reward).
  - **Results screen:** a small line when a match moved a mission on ("Kicks 7/10"). When one
    completes, its chips fly into the pile (reuse the shop's flying-chips animation).

### The pool (~30; three are picked each week by rotation, one of each difficulty)

| Kind | Examples |
|---|---|
| Play | Play 5 matches · Play 3 different games · Play a 3–4 player game |
| Win | Win 3 matches with friends · Win at 2 different games · Beat Ops on Hard |
| Social | Throw 15 things · Send 10 stickers · Taunt 5 times · Fire an Ultimate · Send a voice note |
| Game moments | Kick 10 tokens in Ludo · Win Uno with a +4 · Win Connect Four in 10 moves or fewer · Sink a ship with no misses · Pot 3 balls in one Pool visit · Win a Table Tennis point with a smash |

The week's three are picked deterministically from the week number (e.g. a seeded shuffle of the
pool per difficulty), so every phone shows the same three with no server code.

### Under the hood

- **Missions catalogue:** a new `src/match/missions.ts` — the pool (`id`, `name`, `blurb`,
  `difficulty`, `target`, which event it counts), `weekOf(date)`, `missionsFor(week)`.
- **Events:** one call, e.g. `mission('kick', n)` / `mission('win', { game, vs: 'friend' | 'ops', level })`.
  - Play / win: hook where matches end. Payouts already happen there: `payOut()` in
    `src/match/chips.ts` is called from `useRivalry` / `useRivalryMulti` (`src/match/useRivalry.ts`),
    so missions can tick from the same place (and know online vs Ops vs pass & play from
    `useSession`).
  - Social: throws (`src/match/Throws.tsx`, `launch` when `mine`), stickers
    (`src/match/Reactions.tsx`), taunts (`src/match/Taunts.tsx`), Ultimates (`unleash(from, mine)`
    in `src/match/Ultimates.tsx`), voice notes (`src/match/Voice.tsx`).
  - Game moments: each game reports its own (e.g. Ludo kicks from `live.caps` / `last.kicks` in
    `src/games/ludo/LudoMatch.tsx`). Follow the feats pattern (`src/match/feats.ts`,
    `src/games/battleship/feats.ts`, notes in `docs/rivalry-plan.md`).
- **Storage:** progress in the player's wallet in the database, e.g.
  `wallets/{uid}/missions/{week}/{missionId}: count`, and claims through the same idempotent ledger
  as match payouts (`wallets/{uid}/paid/{key}`, key `mission:{week}:{missionId}`), so a claim can
  only be paid once.
- **Database rules** (`database.rules.json`, wallet section): allow the missions node; cap a claim (a newly collected mission adds ≤ 120 chips). The weekly 300 isn't enforced by the rules
  (the app only offers what's on the card). Add checks to
  `scripts/test-rules.mjs` and run it against the live project after deploying.
- **Homepage tile:** next to the chips tile in `src/pages/Corner.tsx` (the homepage corner tiles;
  memory says rivals/stakes are tiles that open their own pages; keep phone cards single-column).

---

## 2. Ops' Tower

### How it works

- **Ten floors, each a match against a computer opponent** wearing one of the Crew characters, with a
  twist. **The boss at the top is Ops herself**, in her own Screen face (decided),
  because the app's rule is that Ops always wears Screen (`OPS_LOOK` in
  `src/components/OpsFace.tsx`); the Crew characters are her floor guardians, played by the same
  game brains.
- **Hearts:** three per climb. Lose a floor: lose a heart and try again. At zero hearts, drop back to
  the last checkpoint (floors 4 and 7). (Decided over free retries: losing has to cost something.)
- **Rewards:** first clear of each floor pays chips, rising from **10** (floor 1) to **100**
  (floor 9). Beating Ops: **300** chips, a **"Tower champion"** title on your score card, and an
  exclusive **Tower crown** in the wardrobe.
- **Seasons:** the Tower reshuffles **every month** (new games, guardians and twists) and clears
  reset, so it's always worth another climb. Chips per floor are paid once per season.

### Season 1

| Floor | Game | Guardian | Level | Twist |
|---|---|---|---|---|
| 1 | Tic-tac-toe | Bot | Easy | None (warm-up) |
| 2 | Connect Four | Cyclops | Medium | She moves first |
| 3 | Hangman | Die | Medium | 15-second clock |
| 4 ✓ | Dots | Kratops | Medium | Rage: his Ultimate shakes the screen every time he takes a box |
| 5 | Ludo | Hulkops | Medium | He plays 2 colours, you play 1 |
| 6 | Uno | Trotrops | Hard | Best of 3 |
| 7 ✓ | Battleship | Ghops | Hard | Flashbang: your screen whites out after every hit he lands |
| 8 | Othello | Batops | Hard | 10-second clock |
| 9 | Checkers | Spidops | Hard | His web covers the board for a moment each time he captures |
| 10 | Boss: Connect Four, Othello, Quoridor | **Ops** | Hard | Win 2 of 3, on a 20-second clock |

✓ = checkpoint. Characters not used this season (Thanops, Opstimus, Anansops) fill later seasons.

### Twists (built once, usable on any floor)

| Twist | How |
|---|---|
| **Moves first** | The match's starting seat (each game's `initial…State` already takes who starts / match number). |
| **Best of N** | The game's own match option where it has one (Uno, Connect Four, Table Tennis…), or the Tower counts wins across rematches. |
| **Clock** | A per-move countdown on the Tower match screen. On timeout, ask the game's own Ops brain (`bot` prop on `Lobby`, `Brain` in `src/match/bot.ts`) for an **easy** move for *your* seat and play it. No per-game work. |
| **Barrage** | The guardian fires its Ultimate at you at key moments, using the same hook Ops uses to react (`OpsSense.moment` → `unleash`). Looks only: it gets in your way for a moment and never changes the board. |
| **Special rules** | Only Hulkops' Ludo floor needs this: two colours for him, one for you (Ludo's engine already supports colours per seat; `freshLive` in `src/games/ludo/engine.ts`). |

### Under the hood

- **Page:** `/tower` (new `src/pages/Tower.tsx` + `src/styles/tower.css`): a tall stack of floor
  cards (guardian face via `<OpsFace look=…>`, game, twist, reward). Your character climbs it, and
  the current floor glows. A Tower tile on the homepage next to Chips and Rivals.
- **Playing a floor:** reuse the vs-Ops match (`src/lobby/LocalGame.tsx`: `session.bot`,
  `session.level`, Ops is seat 1). The guardian wears its character instead of Screen
  (`looksFor` in LocalGame currently fixes `p1: screen` for Ops), says its own `hello_hard` line
  (`src/match/opsLines.ts`), and the Tower wraps the match with the twist and reads the result
  (`OpsSense.ended`).
- **Storage:** `wallets/{uid}/tower/{season}`: `floor`, `hearts`, `cleared: { [floor]: true }`; floor
  rewards through the paid ledger (key `tower:{season}:{floor}`), so each pays once per season. The
  title and crown are owned items (`wallets/{uid}/owned/towercrown`; add the id to the owned regex
  in the rules and to the wardrobe in `src/components/faces/wardrobe.tsx`).
- **Database rules:** allow the tower node, cap floor rewards (≤ 300), add checks to
  `scripts/test-rules.mjs`.

---

## Build order (one session each)

- [x] **1. Missions core:** (done 2026-10-10) `missions.ts`, storage + rules, homepage tile + list, results line,
      claiming with flying chips; play / win / social missions.
- [x] **2. Missions, game moments:** (done 2026-10-10) hooks in Ludo, Uno, Connect Four, Battleship, Pool and Table
      Tennis; the full pool of ~30.
- [x] **3. Tower core:** (done 2026-10-10) `/tower` page, hearts, checkpoints, rewards, floors 1–6 with the simple
      twists (moves first, best of N); homepage tile.
- [ ] **4. Tower top:** clock and barrage twists, floors 7–10, the Ops boss match, champion title and
      Tower crown, monthly seasons.

Each step: test against Ops / two tabs as the change needs (the user watches session usage, so keep
checks proportionate), then commit, deploy hosting (and database rules when they changed), run
`node scripts/test-rules.mjs`, and tick the step here.

## Decisions (settled 2026-10-10)

1. Tower boss: Crew guardians on floors 1–9, Ops herself (Screen) at the top.
2. Losing in the Tower: 3 hearts per climb, checkpoints at floors 4 and 7.
3. Missions: the same three for everyone.
4. Chips: missions 30 / 60 / 120 + 90 bonus (300 a week); Tower as planned (10→100 per floor,
   300 + crown + title for beating Ops).

Also settled 2026-10-10: Ludo moved down to floor 5 (Medium) and Checkers up to floor 9, so dice luck
doesn't cost a heart right before the boss. Anti-farming: a match ticks missions only when it pays chips
(at least 20 seconds), and a win past 3 a day against the same rival counts as played, not won.

### As built (step 1)

- `src/match/missions.ts`: the pool (28: 9 easy, 10 medium, 9 hard), `weekOf`, `missionsFor` (each
  tier cycles its pool in a fixed shuffle), `mission(event)`, `useMissions`, `collect(id)`, `useMoved`.
  Storage: `wallets/{uid}/missions = { w, n, s, got }`, replaced when the week changes.
- Matches tick from `payOut` (chips.ts); throws, stickers, taunts and Ultimates from the online
  `Reactions` (Reactions.tsx); voice notes from `VoiceNotes`.
- `/missions` page (src/pages/Missions.tsx, src/styles/missions.css), `MissionsTile` on the homepage,
  `MissionLine` under every result, flying chips in `src/components/ChipFlight.tsx`.
- Step 2: game moments are read from each game's final state (`src/match/moments.ts`: Ludo kicks, Uno
  draw cards + going out on a Wild, Connect Four diagonal / 7-disc finish of the deciding game,
  Battleship ships sunk + 5 hits in a row, Pool frames won on the 8, Table Tennis deuce games + wins
  by 7) and passed through useRivalry / useRivalryMulti into the payout, so they count once with the
  match, online with friends only. Not built: 'pot 3 in one visit' and 'win a point with a smash'
  (neither game keeps that in its state).
- New missions get `from: <week>` (the next week number): the shuffle depends on the pool's size, so
  adding one without it would swap the week that's already showing.

### As built (step 3)

- `src/tower/floors.ts` (the ten floors: game, guardian, level, twist, reward, checkpoint, options;
  `open: false` on 7–10 until step 4), `tower.ts` (the climb in `wallets/{uid}/tower = { s, at,
  hearts, best, got, k }`; `settleFloor` is keyed by match, so a retry or refresh never counts twice),
  `start.ts` (`towerMatch`: the floor's options plus its twist: `oppFirst` sets starter/turn to 1,
  `twoColours` deals Ludo 'full' and takes your second colour away), `TowerSheet.tsx` (result sheet,
  hearts).
- A floor opens the game's own page with `navigate('/<game>', { state: { tower: n } })`; the Lobby
  starts the vs-Ops match from it. LocalGame dresses Ops as the guardian (looks, OpsReactions `as`,
  PokeOps), counts each match end once (`sense.ended` final), handles first-to-N floors and draws
  (go again, no heart lost) and shows the sheet. Leaving mid-floor is a loss (ConfirmLeave warns)
  and returns to /tower.
- Floors 3 (Hangman) and 4 (Dots) play without their twists (clock, barrage) until step 4.
- Season = calendar month (UTC); the floors don't reshuffle between seasons yet (step 4).
- Not tested end to end: the "next game" sheet of a first-to-2 floor (Uno, floor 6).
