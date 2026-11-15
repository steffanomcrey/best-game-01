// Boot and the one loop: input every frame, the world advances in fixed 1/60 s
// steps, the renderer paints what is there. Screens: title, play, paused,
// game over, victory.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|upgrade|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, GRID, SIDEBAR, STEP, TOWERS, TOWER_ORDER } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_CANNON, EVENT_FROST, EVENT_KILL, EVENT_LEAK, EVENT_LOSE, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WIN, autoSpend } from './world.js';
import { ACTION_CONFIRM, ACTION_DESELECT, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SELL, ACTION_UPGRADE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, createRandom(seed ^ 0x9e3779b9));
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

// Sidebar hit regions, mirroring render.js: shop cards, wave button, and the
// selected-tower upgrade/sell buttons.
function sidebarHit(p, state) {
  if (p.x < SIDEBAR.x) return null;
  for (let i = 0; i < TOWER_ORDER.length; i += 1) {
    const y = 78 + i * 84;
    if (p.y >= y && p.y <= y + 74) return { kind: 'shop', type: TOWER_ORDER[i] };
  }
  if (p.y >= 330 && p.y <= 382) return { kind: 'wave' };
  const sel = state.selected;
  if (sel && sel.active && p.y >= 502 && p.y <= 542) {
    if (p.x >= 972 && p.x <= 1112) return { kind: 'upgrade' };
    if (p.x >= 1124 && p.x <= 1256) return { kind: 'sell' };
  }
  return { kind: 'none' };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { muted: audio.muted });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__game = {
        phase: world.state.phase, wave: world.state.wave,
        score: world.state.score, kills: world.state.kills,
        gold: world.state.gold, coreHp: world.state.coreHp,
        towers: world.state.towers.filter((t) => t.active).length,
      };
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toLogical(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }
  function startGame() {
    world.reset();
    screen = SCREEN_PLAY;
    announce('Playing. Build towers, then start wave 1.');
  }
  function finishGame(won) {
    screen = won ? SCREEN_WON : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory. Score ${world.state.score}. Best ${best}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }
  function playSounds(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_FROST) audio.frost();
    if (events & EVENT_CANNON) audio.cannon();
    if (events & EVENT_KILL) audio.coin();
    if (events & EVENT_LEAK) audio.leak();
    if (events & EVENT_WAVE_CLEAR) audio.horn();
    if (events & EVENT_WIN) audio.win();
    if (events & EVENT_LOSE) audio.lose();
  }

  function handleClick(p) {
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) {
      startGame();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const hit = sidebarHit(p, world.state);
    if (hit) {
      if (hit.kind === 'shop') { world.state.shop = hit.type; return; }
      if (hit.kind === 'wave') {
        if (world.startWave()) { audio.horn(); announce(`Wave ${world.state.wave} incoming.`); }
        return;
      }
      if (hit.kind === 'upgrade' && world.state.selected) {
        if (world.upgradeTower(world.state.selected)) audio.upgrade();
        return;
      }
      if (hit.kind === 'sell' && world.state.selected) {
        world.sellTower(world.state.selected);
        return;
      }
      return;
    }
    const col = Math.floor(p.x / GRID.cell);
    const row = Math.floor(p.y / GRID.cell);
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return;
    const existing = world.towerAt(col, row);
    if (existing) {
      world.state.selected = existing;
      return;
    }
    world.state.selected = null;
    const placed = world.placeTower(world.state.shop, col, row);
    if (placed) audio.build();
  }

  function handleActions() {
    const shop = input.takeShop();
    if (shop) world.state.shop = shop;
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) startGame();
      else if (screen === SCREEN_PLAY && world.startWave()) { audio.horn(); announce(`Wave ${world.state.wave} incoming.`); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (actions & ACTION_PAUSE && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
    }
    if (actions & ACTION_DESELECT) world.state.selected = null;
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_UPGRADE && world.state.selected) {
        if (world.upgradeTower(world.state.selected)) audio.upgrade();
      }
      if (actions & ACTION_SELL && world.state.selected) world.sellTower(world.state.selected);
    }
  }

  function step() {
    const mouse = input.mouse();
    const col = Math.floor(mouse.x / GRID.cell);
    const row = Math.floor(mouse.y / GRID.cell);
    world.state.hover = mouse.x >= 0 && mouse.x < GRID.width && mouse.y >= 0 && mouse.y < 720
      ? { col, row } : null;
    const events = world.step(STEP);
    playSounds(events);
    if (events & EVENT_WIN) finishGame(true);
    else if (events & EVENT_LOSE) finishGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Actions first: a shop key pressed just before a click must apply to it.
    handleActions();
    for (const click of input.takeClicks()) handleClick(click);
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    window.__game = {
      phase: world.state.phase, wave: world.state.wave,
      score: world.state.score, kills: world.state.kills,
      gold: world.state.gold, coreHp: world.state.coreHp,
      towers: world.state.towers.filter((t) => t.active).length,
    };
    renderer.draw(world.state, screen, best, { muted: audio.muted });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Starlight Keep. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
export { autoSpend };
