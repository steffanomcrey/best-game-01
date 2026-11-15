// Screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the
// real rules forward from a fresh world, spending gold with the same autopilot
// policy a player would use, so every frame is what a real game looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { autoSpend } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

const START_SECONDS = 5;
const PLAY_WAVE = 6;
const PLAY_SECONDS_INTO_WAVE = 14;
const UPGRADE_WAVE = 4;

/** Step the world for `seconds`, in fixed steps, stopping early on win/lose. */
function runFor(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP);
    if (world.state.phase === 'won' || world.state.phase === 'lost') break;
  }
}

/** Play whole waves with the autopilot until `wave` starts, then into it. */
function reachWave(world, wave, secondsInto) {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    if (world.state.phase === 'lost' || world.state.phase === 'won') return;
    if (world.state.phase === 'build') {
      autoSpend(world);
      world.startWave();
    }
    // Just entered the target wave: play into it and stop mid-battle.
    if (world.state.wave === wave && world.state.phase === 'wave') {
      runFor(world, secondsInto);
      return;
    }
    runFor(world, 10);
  }
}

export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    reachWave(world, PLAY_WAVE, PLAY_SECONDS_INTO_WAVE);
    return { screen: world.state.phase === 'lost' ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    reachWave(world, UPGRADE_WAVE, 10);
    // Select the most-upgraded cannon, else any tower, for the panel.
    let pick = null;
    for (const t of world.state.towers) {
      if (!t.active) continue;
      if (!pick || t.level > pick.level || (t.level === pick.level && t.type === 'cannon' && pick.type !== 'cannon')) pick = t;
    }
    if (pick) world.state.selected = pick;
    return { screen: world.state.phase === 'lost' ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    // Full autopilot game: spend, fight, repeat until the boss falls.
    let guard = 0;
    while (world.state.phase !== 'won' && world.state.phase !== 'lost' && guard < 40) {
      guard += 1;
      autoSpend(world);
      if (world.state.phase === 'build') world.startWave();
      runFor(world, 90);
    }
    return { screen: world.state.phase === 'won' ? SCREEN_WON : SCREEN_OVER, best: world.state.score };
  }
  // start (default): a few towers up, wave 1 rolling behind the title panel.
  autoSpend(world);
  world.startWave();
  runFor(world, START_SECONDS);
  return { screen: SCREEN_TITLE, best: 0 };
}
