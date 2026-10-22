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
  - `sound.js` is the sound, shared by both pages (see Sound below).
  - `firestore.rules` is a reference copy; the live rules are in the Firebase console.
- All tuning numbers sit in `CONFIG` at the top of `index.html`. Bump `CONFIG.version` when gameplay changes (currently `web-v0.9`).
- The game state is one object, `S`.
- Three seeded random streams: `rngSpawn` (arrivals) and `rngWeek` (meeting offers) depend only on the seed, so ranked games are the same for everyone. `rng` covers anything that depends on the player's moves.
- The screen redraws about 5 times a second. CSS animations survive the redraws through a negative `animation-delay` (`ago()`, `fresh()`), and `setHTML()` skips unchanged writes.
- `window.__toy` is the debug and test hook.
- Screens and dialogs all go through `showModal(kind)` on `#ov`:
  - Full pages (`#ov.screen`): `landing`, `join`, `nick`, `lobby`, `intro`, `closed`. `firstModal()` picks the landing page, or the join screen for a `?pin=` link.
  - Over the board (`#ov.meeting`): `week` and `height` (Extra Layer). `setPeek()` hides them so players can look at the paused board (button, hold P, Esc).
  - Ordinary dialogs: `paused` (holds the tools on phones), `howto` (How to play from the pause menu), `tutdone` (end of the tutorial), and `over` (`#ov.results`): the rank badge (`resBadge`), a line on who is ahead or behind (`resSub`), the lesson, stats, the power-ups used (including `S.layerPicks`), and the live leaderboard (`overBoard`).
  - Pause and results both have **Main menu** ("Leave game" in a PIN game), which calls `leaveGame()`. Leaving a ranked run before it stalls takes a second tap (`midRun()`), and the player's state becomes `left` so the host stops listing them as still playing.
- **Transitions:** minor ones (dialogs over the board) fade the scrim in 0.2 s and grow the dialog from 96%; major ones (full screens) crossfade in 0.45 s, and the board settles in (`.wrap.enter`) when a screen gives way to the game. `hideModal()` keeps the overlay's look classes until the fade ends. `sound.js` plays a swell and fades the new music in on major changes (landing ↔ game, game over → anything).
- **How to play:** `howBox(where)` draws the four approved steps (`HOW`, `HOW_ART`) on the practice intro, in the lobby and in the `howto` dialog; arrow keys turn the steps. Rules only: it never describes a sound.
- **Tutorial:** `startTutorial()` builds a scripted board and `S.tut` walks eleven beats (`TUT`, `tutGo`, `tutCheck`): one each for Drop, Reroute and Defer, and the meeting opens with Extra Layer. The clock waits (`tick` returns) until beat 8, `canPlace` only allows the move the coach asks for (`S.tut.only`), `arm` only the taught power-up, and a coach bubble plus spotlight (`#coach`, `#spot`, `tutLayout()`) follow the layout. Done is remembered under `minimep.tutDone`; never part of ranked games.
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
  - `sessions/<PIN>` holds `{hostUid, mode, status, seed, createdAt, expiresAt}`. Anyone can look up a game by PIN, but only its host can list it (the PIN is the key). Games close by themselves after 24 hours: `net.js` reads a session past `expiresAt` as closed, and the rules refuse player writes to it. The host page's "Your games" lists the host's own games (`listMySessions()`) with Open and Close, and closes expired ones for real.
  - `sessions/<PIN>/players/<uid>` holds `{nick, state, games, best, runs[≤20]}`.
  - Each player writes only their own document; only the host changes the game.
  - When the rules change, push the code first, then publish `firestore.rules` in the console (new rules require `expiresAt`, which older pages don't send).

## Sound (`sound.js`)
- Everything is synthesized with Web Audio; there are no sound files. Nothing plays before the first click or key press (browser rule).
- The music follows Disasterpeace's Mini Motorways approach: **the corridor makes the music**.
  - One major pentatonic key; each week moves it a fifth (`ROOTS`).
  - Trades are instruments in their own register (pipes low, ducts middle, trays high), rooms are notes, and the door's position is the pan.
  - Placed runs play a pulse on a 96 BPM grid; the pad thins as the corridor fills; Extra Layer adds a bell voice.
  - An open crossing is a slightly out-of-tune horn that speeds up and gets louder in its last 5 s; deferred ones go muffled and slow.
  - Each Clash Area muffles the music a step; meetings, pause and Peek muffle it all.
- The page tells it what is going on through `MiniSound.watch(fn)`: the game's function returns the mode (`landing`, `count`, `game`, `over`) plus the placed runs, open crossings, week and Clash Area count. Event sounds go through `snd(id, opts)` → `MiniSound.cue`.
- The landing page plays the corridor drawing as music (hover notes off). Starting a game filters it down; a swell bridges into the game music, which fades in. The tutorial adds a coach chime, a step-done figure and a finish chord.
- Mute: the speaker button, the M key, or the pause menu, which also has the volume slider. Saved under `minimep.sound`, shared by the game and host. The host page plays a note for each player who joins.
- The source of the sounds is the private Sound Lab prototype; change sounds there first, then port them.

## Tests
Both tests serve the repo over local http with a fake backend and a null config, so they never touch the real project.
- `tests/web.spec.js`: a host plus players, end to end. Expect 40/40.
- `tests/layout.spec.js`: theme, pause menu, the three layouts, rotate prompt, touch, the gameplay HUD, power-ups, the meeting with Peek, practice results, sound, strikes, How to play, the tutorial and transitions. Expect 78/78.

Run them with `PW_MODULE=<path to playwright-core> node tests/<name>.spec.js <screenshot dir>`, using an installed Chrome or Edge. Keep `node_modules` out of the repo; screenshots (`*.png`) are git-ignored.

## Build plan (UI redesign)
- **Done:**
  - Step 1: theme, layouts, touch, rotate prompt.
  - Step 2: landing page and join flow.
  - Step 3: gameplay HUD, arrival cards, power-ups, meeting with Peek, Extra Layer.
  - Step 4: results screen (rank first, live leaderboard beside it) and the projector host screen (join banner, bar chart, status panel, one button bar).
  - Step 5: sound.
  - How to play, transitions and the tutorial.
- **Next:**
  - Step 6: phone checks.

## Conventions
- **UI:**
  - Large text: nothing under 14 px; dialogs, toasts and tooltips are big.
  - A less busy screen: the board fills the view, power-ups are icon overlays, and status lives on the map (Mini Motorways style).
  - Behind a dialog the board must be **unreadable**: a dark scrim of 78–90% plus blur. Players who need to see the board use Peek.
- **Sound in text:** never describe a sound to players (no "you'll hear…"). They learn the cues by ear.
- **Copy and code:**
  - American spelling, plain verbs, concise.
  - Match the surrounding code style: compact, sparse comments, names from the game's vocabulary (run, lane, layer, band, crossing, Clash Area, power-up). The code still calls power-ups `CARDS`.
- **Game terms:**
  - The game is one level and one corridor. The section shows **Layer 1, Layer 2…** (never "L1", which reads as a building level). A **band** is the layers a trade agreed to use; neighboring bands can share a layer. Never call a layer a "level".
  - Game time is told in weeks ("until the end of next week", "due at the end of week 3"), never dates or days.
  - Services arrive; once laid they are runs. The architect *lowers* the ceiling (Drop is a power-up).
  - Power-ups: Drop, Reroute, Defer, and Extra Layer (one more layer in weeks 2 and 4, "a gift from the architect").
  - A crossing left open hardens into a **Clash Area**: "logged, not solved" (it is on the clash list but nobody solved it; the old line "a place, not a decision" read as neutral). Defer puts a crossing **on hold**; never say "park" for either, so the two can't be confused. Each Clash Area is a strike ("Clash Area 1 of 3"). Decisions don't name a trade or an "owner".
  - Ranking: most services fitted, then fewest Clash Areas, then most weeks. The ranked score freezes at the first stall.
