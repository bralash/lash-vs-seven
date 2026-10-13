# Shootout (penalty shootout): plan

Planned 2026-10-12. A two-player penalty shootout, online and against Ops. Its signature is the
**keeper's view: the camera sits behind your keeper**, inside the goal, looking out at the
shooter, so you watch the run-up and the ball coming at you.

Build it **one session per step** (see "Build order"). Each step ends with a commit and a deploy,
and its status ticked here.

> All four decisions were settled with the user on 2026-10-12 (see "Decisions" at the end).

---

## 1. The game

- **Name:** Shootout, slug `shootout` (route `/shootout`), category `sport`, ~3 min,
  modes `online + Ops`, fullscreen like Ping Pong and Ampe.
- **Format:** 5 kicks each, taken in turns (A shoots, B keeps, then B shoots, A keeps). It ends
  early once one side can't catch up. Level after 5 each: **sudden death**, one kick each until
  one scores and the other doesn't. Who shoots first alternates each match (seat 0 in odd matches,
  like Ampe's lead).
- **Every kick, both players choose in secret** (the fair way to do it online, as in Ampe):
  - **Shooter** picks one of **6 spots**: left, middle or right, low or high.
  - **Keeper** picks a **dive**: the same 6 spots. Staying put is "middle" (low or high).
- **The outcome:**
  - The keeper dives to the shot's spot: **saved**.
  - The right side but the wrong height: **fingertips**, a 50/50. Online, the coin is a bit of a hash (FNV-1a)
    of both salts, so both phones get the same result and neither can rig it.
  - The wrong side: **goal**.
  - The shooter can also **miss** (see Aim below): over the bar, wide, or off the post.
- **No pick in time:** a shooter who hasn't shot scuffs it and the keeper gathers it (always saved:
  in testing a scuff down the middle scored too often). A keeper who hasn't picked stands still (low middle).
  So the clock always matters.

### Aim (the shooter's skill)

One gesture: **drag from the ball toward the goal and let go.**
- While you drag, an **aim dot** shows on the goal and **sways a little**, more the closer it is to
  a post or the bar. Wherever it sits when you let go is the shot.
- Aim for the corners and the sway can take it **wide, over, or off the post**. The middle is safe
  but easy to save. So: risk against reward, plus timing your release.
- The spot (one of 6) and "on target or not" are worked out on the shooter's phone when you let go
  and locked in together. Like Ping Pong's shots, the shooter's own phone is trusted with its
  skill; the secret part is *where*.

### Keeping (the keeper's skill)

From the keeper's view: **swipe the way you'll dive** (left/right, up for high, a tap to stay).
- Your keeper leans the way you've picked (gloves raised for high), so you can see your choice.
  You can **change it until the strike**, like Ampe's foot.
- At the strike your keeper dives, and the ball comes at the camera. A save is the ball meeting
  the gloves; a goal goes past your shoulder into the net right behind you.
- **Ops reads (easy only):** on easy, Ops' run-up gives a tell (her hips open toward her spot for
  a moment). Medium and hard give none. Learning aids on easy only, as Ping Pong does.

### Timing of a kick

1. **Set (≈1s):** the ball on the spot, a whistle. Both players can start choosing.
2. **Shooter's clock (6s):** the shooter drags and lets go. Letting go starts the **run-up (1.1s)**.
   Running out of time means the scuffed shot.
3. **Strike:** the keeper's last chance to change. Picks are revealed.
4. **Flight (≈0.6s, slowed on close calls) and result (1.5s):** GOAL / SAVED / FINGERTIPS / POST /
   OVER / WIDE banner, the scoreboard ticks, and the next kick sets up with the camera swapped.

---

## 2. Cameras

| Role | Camera | What you see |
|---|---|---|
| **Keeper** | **Behind the keeper, inside the goal** (the requested view) | Your keeper's back and gloves at the bottom of the screen, the posts and bar framing the edges, the pitch and the shooter at the spot 11 m away. The shooter runs toward you; the ball grows as it comes. |
| **Shooter** | Behind the ball | The ball at the bottom, the other keeper facing you in goal, the aim dot on the goal. After the strike the camera cuts to the keeper's view for the flight, so both players see the save or goal from the same angle. |

The cut to the keeper's view on every strike keeps the keeper camera at the heart of the game, even
when you're shooting.

### Drawing it

- **SVG with a simple 3D projection** (like `pong-scene` in `src/games/pong/PongMatch.tsx`, no
  3D library): a pitch point (x, y, z) goes to the screen as `x * f / z`, `y * f / z`. The ball's
  flight is a curve from the spot to its target in the goal, sized by depth, with a shadow on the
  grass.
- The goal frame is close to the camera, so the posts sit at the screen edges and the bar near the
  top; the net is a faint mesh at the sides, out of the way.
- **Look:** the app's style (paper, ink outlines, hard shadows). A flat green pitch with mown
  stripes, a white penalty spot and box lines, a simple crowd band in the distance. Seat colours on
  the kits: orange for seat 0, blue for seat 1 (keeper kits in a darker shade of the same).
- **Phone first:** portrait 375×812 and 390×664; on a short, wide screen the scene keeps room for
  the scoreboard (Ping Pong's fix). The top bar (leave, reactions, voice, sound) stays above it.

### Art (sprite sheets, the Ping Pong / Ampe way)

The same noodle figure style as Ping Pong and Ampe, from ChatGPT sheets in `art/shootout-chatgpt/`,
cut with `node scripts/sprite-sheet.mjs shootout` (add a `shootout` entry to the cutter).
Right-side moves are the left ones mirrored.

| Sheet | Frames |
|---|---|
| Keeper, **from behind** | ready crouch, lean left, lean left high, dive left low, dive left high, jump up (high middle), stand (low middle), celebrate, beaten (on knees) |
| Shooter, **from the front** (running toward the keeper's camera) | stand at the ball, 4 run-up frames, strike, celebrate, hands on head |
| Keeper, **from the front** (shooter's view) | ready, dive left low, dive left high, jump up, stand |
| Shooter, **from behind** (shooter's view) | stand, run-up, strike |

Until the art is in, step 1 uses plain SVG stick figures.

---

## 3. Online

The same shape as Ampe (`src/games/ampe/engine.ts`), at `matches/shootout/{code}`:

- `live`: kick number `n`, `shooter` seat, the set time, the score so far as a list of kicks
  (`'goal' | 'saved' | 'miss'` per kick, per seat), `commit` / `reveal` per seat (`s0` / `s1` keys:
  RTDB turns 0/1 keys into arrays), `last`, `result`. No winner is stored as `-1` (RTDB drops nulls).
- **Lock-in:** each pick is sent as SHA-256 of `"n:pick:salt"`; refused once anyone has revealed.
  The keeper may lock in again (changing their dive) until then. Lock-ins are chained and the
  reveal waits for them, so the pick revealed is always the one locked in (the bug Ampe hit).
- **Reveal at the strike:** both reveal pick + salt; the other phone checks it with `honest()`. A
  bad reveal ends the match as a foul. A phone that never reveals counts as no pick after 3.5s.
- The lock-in code is now in two games: move `commitOf`, `newSalt`, `honest` into a shared
  `src/match/lockin.ts`, and have Ampe use it too.
- Disconnect countdown, leaving (Leave = loss), host handover, rematch, rivalry, stakes,
  voice notes: as in every online game via `src/match/`.

---

## 4. Ops

- **Ops in goal:** guesses from your habits, like Ampe's foot: what you did after the same kind of
  kick before, and your favourite side. Easy dives at random, medium follows the habit half the
  time, hard most of the time (with some randomness so she's never certain).
- **Ops shooting:** picks a spot weighted away from where you've dived lately. Her aim sways like
  yours: easy aims safe and misses rarely, hard goes for the corners and sometimes hits the post.
- Ops Reactions need a `sense` for Shootout (a save, a goal, a miss, sudden death).
- No records against Ops, as everywhere.

---

## 5. Around the game

- **Registry entry** with rules (Shoot, Keep, Fingertips, Sudden death, Secret picks).
- **Results:** the VsBlock win head; a **shootout strip** (● scored, ✕ saved/missed per kick, one
  row per player, like the TV graphic). The same strip as the share-card `detail` kind.
- **Feats (2):** `shootout:wall` (save 3 in one shootout) and `shootout:panenka` (score high
  middle while the keeper dives to a side).
- **Sounds** (made in code, `src/lib/sound.tsx`): whistle, kick thud, net swish, post clang, glove
  smack, crowd roar/groan.
- Later, not in v1: spectators, a mission ("Save 5 penalties"), a Tower floor.

---

## Build order

1. **Engine and the keeper's view vs Ops** (stick figures). `engine.ts` (kicks, judge, shootout
   end and sudden death, Ops picks) with tests; the keeper camera and ball flight; the shooter
   camera and aim sway; vs Ops on all three levels. Feel check on a phone. *Status: built 2026-10-12, committed, not deployed (user: keep it minimal; sprites next). Registry `vs Ops` until step 3; lock-in hashing still to add*
2. **Art and feel.** The 4 sprite sheets, dive and run-up animations, banners, sounds, slow motion
   on close calls, easy-only tells and a first-time How to play (like Ping Pong's).
   *Status: look done 2026-10-13 (2 sheets, not 4: no faces, so one keeper sheet serves both cameras; Ping Pong's flat yellow look; reactions after every kick). Sounds, How to play, slow motion and easy tells done 2026-10-13 (step 2 complete).*
3. **Online and the rest.** Shared `lockin.ts`, rooms, reveal checks, disconnects, rivalry,
   feats, Results strip and share card, Ops reactions `sense`; registry `live`. Two-tab test
   (full shootout incl. sudden death, rematch). Deploy. *Status: built 2026-10-13, committed, not deployed. Two-tab test passed (full shootout ending early, fingertips, rematch, rivalry); sudden death covered by engine tests only; a phone going quiet not tested live.*

---

## Decisions (settled with the user, 2026-10-12)

1. **Shooter's camera:** behind the ball, cutting to the keeper's view at the strike.
2. **The keeper picks before the strike** (secret lock-in, fair online). A reflex keeper may come
   later, once this version has been played.
3. **No pass & play**, like Ping Pong and Ampe.
4. **Name:** Shootout (slug `shootout`).
