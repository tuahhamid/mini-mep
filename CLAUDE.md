# Mini MEP

A browser puzzle game about fitting pipes, ducts and cable trays into a hospital corridor ceiling. The first mode is **Segment Routing**. Live at https://tuahhamid.github.io/mini-mep/ (players) and `/host.html` (hosts).

The maintainer is a BIM coordinator, not a game developer. Explain game-dev choices in plain terms.

## This repo is public
- Everything here is public, this file included. **Fictionalize everything**: no real project, client or company names, element IDs, quotes or private file paths.
- Private context (design decisions, specs, roadmap, the UI board and Sound Lab links) lives outside the repo. `CLAUDE.local.md` (git-ignored) says where. Read it first if it exists.
- Before any push, scan the change for keys, tokens and private names. Say up front if GitHub secret scanning will flag something. The Firebase web key in `firebase-config.js` is public by design and restricted to this site.
- Commit and push only when asked. Pushing to `main` deploys to GitHub Pages in about a minute.

## How the code is built
- No build step: plain HTML + vanilla JS + SVG.
  - `index.html` is the game.
  - `host.html` is the host screen.
  - `net.js` + `backend-firebase.js` are the online layer.
  - `firestore.rules` is a reference copy; the live rules are in the Firebase console.
- All tuning numbers sit in `CONFIG` at the top of `index.html`. Bump `CONFIG.version` when gameplay changes (currently `web-v0.8`).
- The game state is one object, `S`.
- Three seeded random streams: `rngSpawn` (arrivals) and `rngWeek` (meeting offers) depend only on the seed, so ranked games are the same for everyone. `rng` covers anything that depends on the player's moves.
- The screen redraws about 5 times a second. CSS animations survive the redraws through a negative `animation-delay` (`ago()`, `fresh()`), and `setHTML()` skips unchanged writes.
- `window.__toy` is the debug and test hook.
- Screens and dialogs all go through `showModal(kind)` on `#ov`:
  - Full pages (`#ov.screen`): `landing`, `join`, `nick`, `lobby`, `intro`, `closed`. `firstModal()` picks the landing page, or the join screen for a `?pin=` link.
  - Over the board (`#ov.meeting`): `week` and `height` (Extra Layer). `setPeek()` hides them so players can look at the paused board (button, hold P, Esc).
  - Ordinary dialogs: `paused` (holds the tools on phones), `over`.
- Gameplay:
  - `header.hud` holds the week dial, the score, the Clash Area slots and the round tools.
  - `renderQueue()` draws the arrival cards; dragging from a card uses window pointer listeners, because the cards re-render during a drag.
  - `armTarget()` lights up the crossings an armed power-up can work on.
- Layouts are chosen by CSS media queries:
  - **Desktop:** wider than 1100 px.
  - **Compact:** 700–1100 px.
  - **Phone sideways:** `max-height:500px` in landscape.
  - **Phone upright:** gameplay shows the rotate prompt (`rotateCheck()`).

  Touch is tap a run, then tap a slot.
- The theme follows the system until the player picks one; the choice is saved under `minimep.theme`, which the game and host share.
- Firestore data:
  - `sessions/<PIN>` holds `{hostUid, mode, status, seed}`.
  - `sessions/<PIN>/players/<uid>` holds `{nick, state, games, best, runs[≤20]}`.
  - Each player writes only their own document; only the host changes the game.

## Tests
Both tests serve the repo over local http with a fake backend and a null config, so they never touch the real project.
- `tests/web.spec.js`: a host plus players, end to end. Expect 27/27.
- `tests/layout.spec.js`: theme, pause menu, the three layouts, rotate prompt, touch, and the gameplay HUD, power-ups and meeting with Peek. Expect 34/34.

Run them with `PW_MODULE=<path to playwright-core> node tests/<name>.spec.js <screenshot dir>`, using an installed Chrome or Edge. Keep `node_modules` out of the repo; screenshots (`*.png`) are git-ignored.

## Build plan (UI redesign)
- **Done:**
  - Step 1: theme, layouts, touch, rotate prompt.
  - Step 2: landing page and join flow.
  - Step 3: gameplay HUD, arrival cards, power-ups, meeting with Peek, Extra Layer.
- **Next:**
  - Step 4: results screen (rank first, leaderboard beside it) and the projector host screen.
  - Step 5: sound (synthesized with Web Audio).
  - Step 6: phone checks.

## Conventions
- **UI:**
  - Large text: nothing under 14 px; dialogs, toasts and tooltips are big.
  - A less busy screen: the board fills the view, power-ups are icon overlays, and status lives on the map (Mini Motorways style).
  - Behind a dialog the board must be **unreadable**: a dark scrim of 78–90% plus blur. Players who need to see the board use Peek.
- **Copy and code:**
  - American spelling, plain verbs, concise.
  - Match the surrounding code style: compact, sparse comments, names from the game's vocabulary (run, lane, layer, band, crossing, Clash Area, power-up). The code still calls power-ups `CARDS`.
- **Game terms:**
  - Power-ups: Drop, Reroute, Defer, and Extra Layer (one more layer in weeks 2 and 4, "a gift from the architect").
  - A crossing left open hardens into a **Clash Area**: "a place, not a decision".
  - Ranking: most services fitted, then fewest Clash Areas, then most weeks. The ranked score freezes at the first stall.
