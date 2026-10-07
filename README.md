# Lash vs Seven

Two-player games you play with a friend over a link. Vite + React + TypeScript, Firebase Realtime Database for rooms, Firebase Hosting.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
firebase deploy --only hosting   # builds first (predeploy); needs: npm i -g firebase-tools && firebase login
```

## Layout

| Path | What it is |
| --- | --- |
| `src/games/registry.ts` | Every game: name, blurb, status (`live`/`soon`), rules. Drives the homepage and lobbies. |
| `src/pages/Home.tsx` | Homepage game list. |
| `src/lobby/` | Shared lobby: create/join room, invite links, waiting room, presence. `rooms.ts` is the Firebase layer. |
| `src/games/<slug>/` | One folder per game. Renders `<Lobby>` and supplies the in-match screen. |
| `src/styles/tokens.css` | Colours, type, shadows — change the look here. |
| `public/classic/` | The original site (recovered from the old deploy), served untouched at `/classic/` so games not rebuilt yet stay playable. |

## Adding a game

1. Set its entry in `registry.ts` to `status: 'live'` and add `rules`.
2. Create `src/games/<slug>/<Name>.tsx` that renders `<Lobby game={…} renderGame={…} />`.
3. Add the route in `src/App.tsx` and a `/<slug>.html` → `/<slug>` redirect in `firebase.json`.

Rooms are stored at `rooms/<slug>/<CODE>` with `{ status, hostId, players: { <playerId>: { name, seat, online } }, state }`.
