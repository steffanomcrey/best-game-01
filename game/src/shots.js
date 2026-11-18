// Screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the
// real rules forward from a fresh world, spending gold with the same autopilot
// policy a player would use, so every frame is what a real game looks like
// and the same seed always gives the same frame.
import { STEP, TOWERS } from './config.js';
import { AUTO_CELLS, autoChooseRelic, autoSpend } from './world.js';

// Play-scene build policy: a real player's late-game repositioning. The wall
// sits on the middle and lower bends (rows 3-8), so the swarm streams down
// the open top road at full strength and the fight happens across the whole
// board instead of in one kill zone at the gate. Same spend shape as the
// autopilot (build in order, then upgrade), restricted to the wall cells.
const PLAY_CELLS = AUTO_CELLS.filter((c) => c.row >= 3);
function playSpend(world) {
  const s = world.state;
  for (const cell of PLAY_CELLS) {
    if (s.gold < TOWERS[cell.type].cost) continue;
    if (world.towerAt(cell.col, cell.row)) continue;
    world.placeTower(cell.type, cell.col, cell.row);
  }
  let spent = true;
  while (spent) {
    spent = false;
    for (const t of s.towers) {
      if (!t.active || t.level >= 3) continue;
      const cost = world.upgradeCost(t.type, t.level);
      if (cost !== null && s.gold >= cost) {
        world.upgradeTower(t);
        spent = true;
      }
    }
  }
}
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

const PLAY_WAVE = 6;
const PLAY_SECONDS_INTO_WAVE = 6;
const UPGRADE_WAVE = 4;
// The play shot hunts, one fixed step at a time, for the busiest frame of
// wave 6: many enemies spread along the whole road, shots in the air and
// fresh kill sparks. Seeded, so the hunt lands on the same frame every run.
const HUNT_MAX_SECONDS = 40;
const HUNT_MIN_ENEMIES = 16;
const HUNT_MIN_PROJECTILES = 7;
const HUNT_MIN_SPREAD = 1200; // furthest enemy's distance along the path

function frameRichness(world) {
  let enemies = 0;
  let spread = 0;
  for (const e of world.state.enemies) {
    if (!e.active) continue;
    enemies += 1;
    if (e.dist > spread) spread = e.dist;
  }
  let projectiles = 0;
  for (const p of world.state.projectiles) if (p.active) projectiles += 1;
  let particles = 0;
  for (const p of world.state.particles) if (p.active) particles += 1;
  return { enemies, projectiles, particles, spread };
}

// The world is plain pooled objects, so a frame can be snapshotted and
// restored field by field. Projectile targets are remapped by pool index.
function snapshotWorld(world) {
  const s = world.state;
  const snap = {
    gold: s.gold, score: s.score, kills: s.kills, coreHp: s.coreHp,
    wave: s.wave, phase: s.phase, elapsed: s.elapsed,
    spawnTimer: s.spawnTimer, spawnIndex: s.spawnIndex, waveKills: s.waveKills,
    spawnList: s.spawnList.slice(),
    relics: s.relics.slice(),
    relicOffer: s.relicOffer ? s.relicOffer.slice() : null,
    relicMods: { ...s.relicMods },
    towers: s.towers.map((o) => ({ ...o })),
    enemies: s.enemies.map((o) => ({ ...o })),
    particles: s.particles.map((o) => ({ ...o })),
    floats: s.floats.map((o) => ({ ...o })),
    projectiles: s.projectiles.map((o) => ({ ...o, target: o.target ? s.enemies.indexOf(o.target) : -1 })),
  };
  return snap;
}
function restoreWorld(world, snap) {
  const s = world.state;
  s.gold = snap.gold; s.score = snap.score; s.kills = snap.kills;
  s.coreHp = snap.coreHp; s.wave = snap.wave; s.phase = snap.phase;
  s.elapsed = snap.elapsed; s.spawnTimer = snap.spawnTimer;
  s.spawnIndex = snap.spawnIndex; s.waveKills = snap.waveKills;
  s.spawnList = snap.spawnList.slice();
  s.relics = snap.relics.slice();
  s.relicOffer = snap.relicOffer ? snap.relicOffer.slice() : null;
  s.relicMods = { ...snap.relicMods };
  const restorePool = (pool, saved) => {
    for (let i = 0; i < pool.length; i += 1) Object.assign(pool[i], saved[i]);
  };
  restorePool(s.towers, snap.towers);
  restorePool(s.enemies, snap.enemies);
  restorePool(s.particles, snap.particles);
  restorePool(s.floats, snap.floats);
  for (let i = 0; i < s.projectiles.length; i += 1) {
    const saved = snap.projectiles[i];
    const target = saved.target >= 0 ? s.enemies[saved.target] : null;
    Object.assign(s.projectiles[i], saved, { target });
  }
}

// Step through the rest of the wave one fixed step at a time (projectile
// volleys are transient, so coarser sampling misses them), keep the richest
// frame seen (enemies on the road, shots in the air, kill sparks, swarm
// spread along the path), then restore that exact frame.
function huntBusyFrame(world) {
  let best = null;
  let bestScore = -1;
  const maxSteps = Math.round(HUNT_MAX_SECONDS / STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    world.step(STEP);
    if (world.state.phase !== 'wave') break;
    const r = frameRichness(world);
    const score = r.enemies * 2.5 + r.projectiles * 8 + r.particles * 0.6 + r.spread / 60;
    if (score > bestScore) { bestScore = score; best = snapshotWorld(world); }
    if (r.enemies >= HUNT_MIN_ENEMIES && r.projectiles >= HUNT_MIN_PROJECTILES && r.spread >= HUNT_MIN_SPREAD) break;
  }
  if (best) restoreWorld(world, best);
}

/** Step the world for `seconds`, in fixed steps, stopping early on win/lose. */
function runFor(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP);
    if (world.state.phase === 'won' || world.state.phase === 'lost') break;
  }
}

/** Play whole waves with the autopilot until `wave` starts, then into it. */
// pickRelicCap: draft relics only while the just-cleared wave is below this
// number (Infinity = always draft, 0 = never). The play scene caps early so
// its wall stays weak enough for the swarm to flood the whole road, while
// still showing the first drafted relic chips.
function reachWave(world, wave, secondsInto, spend = autoSpend, pickRelicCap = Infinity) {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    if (world.state.phase === 'lost' || world.state.phase === 'won') return;
    if (world.state.phase === 'build') {
      spend(world);
      if (world.state.wave < pickRelicCap) autoChooseRelic(world);
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
    reachWave(world, PLAY_WAVE, PLAY_SECONDS_INTO_WAVE, playSpend, 2);
    if (world.state.phase === 'wave' && world.state.wave === PLAY_WAVE) huntBusyFrame(world);
    return { screen: world.state.phase === 'lost' ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    // Draft left unclaimed: the relic offer panel stays on screen next to
    // the selected tower's upgrade panel, two systems in one frame.
    reachWave(world, UPGRADE_WAVE, 10, autoSpend, 0);
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
      autoChooseRelic(world);
      if (world.state.phase === 'build') world.startWave();
      runFor(world, 90);
    }
    return { screen: world.state.phase === 'won' ? SCREEN_WON : SCREEN_OVER, best: world.state.score };
  }
  // start (default): a real mid-game battle (wave 3, towers up, swarm on
  // the road, shots in the air) rolling behind the title panel.
  reachWave(world, 3, 9);
  if (world.state.phase === 'wave') huntBusyFrame(world);
  return { screen: SCREEN_TITLE, best: 0 };
}
