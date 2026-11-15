# Starlight Keep

A tower defense game for the make.fun best-game-01 bounty. Original game:
defend a crystal core against 10 waves of void creatures marching down a
winding road. No libraries, no network requests, no assets: all art is drawn
on canvas and all sound is synthesized with WebAudio.

## How to play

Serve `game/` statically (for example `node serve.ts`, then open
http://localhost:8080) and play with keyboard and mouse.

- **Build**: pick a tower in the sidebar (or keys 1/2/3), click a glowing
  grid tile to place it. Arrow Spire (50g, fast), Frost Obelisk (75g, slows),
  Star Cannon (120g, splash).
- **Waves**: press Space or the Start Wave button. Enemies follow the purple
  road to the crystal. Kills pay gold; clearing a wave pays a bonus.
- **Upgrade / sell**: click a tower to inspect it, U upgrades it to level 3,
  X sells it back at 70%.
- **Win / lose**: clear wave 10 and slay the Void Tyrant to win. If the
  crystal's 20 health reaches 0, the Keep falls.
- **Other keys**: P pause, R restart, M mute, Esc deselect.

## Files

- `main.ts` hands `game/` and `screenshots/` to the make.fun grader and
  writes `dossier.json` with the vendored `vendor/makefun-game.ts`.
- `game/src/world.js` holds the rules (towers, pathing, economy, waves) with
  no DOM in it, so it runs headless in Node for balance tests.
- `game/src/shots.js` stages the four screenshots by playing the real rules
  with a deterministic autopilot: title, mid-wave battle, tower upgrade,
  victory.

## Screenshots

`?shot=start|play|upgrade|end&seed=1` stages each scene; see `shots.json`.
