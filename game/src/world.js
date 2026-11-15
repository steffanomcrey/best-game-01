// Starlight Keep rules, no drawing and no browser in it: towers, enemies on a
// fixed path, projectiles, gold economy, waves and the win/lose conditions.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can play sounds without the world knowing about screens.
// Nothing here allocates after createWorld returns (pools are fixed).
import {
  CORE, CORE_HP, ENEMIES, GRID, HP_PER_WAVE, PATH, SPEED_PER_WAVE,
  SPAWN_INTERVAL, START_GOLD, TOTAL_WAVES, TOWERS, TOWER_ORDER, UPGRADE,
  WAVE_CLEAR_BONUS, WAVES, SELL_RATE, WIN_BONUS_PER_CORE_HP, isPathCell,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_FROST = 2;
export const EVENT_CANNON = 4;
export const EVENT_KILL = 8;
export const EVENT_LEAK = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_WIN = 64;
export const EVENT_LOSE = 128;

const MAX_ENEMIES = 96;
const MAX_PROJECTILES = 128;
const MAX_PARTICLES = 256;
const MAX_FLOATS = 48;

function cellCenter(col, row) {
  return { x: col * GRID.cell + GRID.cell / 2, y: row * GRID.cell + GRID.cell / 2 };
}

export function towerStats(type, level) {
  const def = TOWERS[type];
  const up = level >= 2 ? UPGRADE[level - 1] : null;
  const dmgMul = up ? up.dmgMul : 1;
  const rangeAdd = up ? up.rangeAdd : 0;
  return {
    damage: def.damage * dmgMul,
    range: def.range + rangeAdd,
    rate: def.rate,
    splash: def.splash || 0,
    slow: def.slow || 0,
    slowTime: def.slowTime || 0,
  };
}
export function upgradeCost(type, level) {
  if (level >= 3) return null;
  return Math.round(TOWERS[type].cost * UPGRADE[level].costMul);
}

export function createWorld(random) {
  const towers = [];
  const enemies = [];
  const projectiles = [];
  const particles = [];
  const floats = [];
  for (let i = 0; i < 32; i += 1) {
    towers.push({ active: false, id: 0, type: 'arrow', col: 0, row: 0, x: 0, y: 0, level: 1, invested: 0, cooldown: 0, angle: 0, kills: 0 });
  }
  for (let i = 0; i < MAX_ENEMIES; i += 1) {
    enemies.push({ active: false, type: 'mite', hp: 1, maxHp: 1, x: 0, y: 0, wp: 1, speed: 0, slowUntil: 0, slowFactor: 1, r: 10, gold: 0, leak: 1, dist: 0 });
  }
  for (let i = 0; i < MAX_PROJECTILES; i += 1) {
    projectiles.push({ active: false, x: 0, y: 0, tx: 0, ty: 0, target: null, speed: 0, damage: 0, splash: 0, slow: 0, slowTime: 0, color: '#fff', kind: 'arrow' });
  }
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 2 });
  }
  for (let i = 0; i < MAX_FLOATS; i += 1) {
    floats.push({ active: false, x: 0, y: 0, text: '', life: 0, color: '#fff' });
  }

  const state = {
    gold: START_GOLD, score: 0, kills: 0, coreHp: CORE_HP, wave: 0,
    phase: 'build', // build | wave | won | lost
    towers, enemies, projectiles, particles, floats,
    elapsed: 0, spawnTimer: 0, spawnIndex: 0, spawnList: [],
    selected: null, // tower object or null
    shop: 'arrow', // tower type chosen in the shop
    hover: null, // {col,row} or null
    waveKills: 0,
  };
  let nextTowerId = 1;
  let time = 0;

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }
  function spawnParticle(x, y, color, count, speed) {
    for (let n = 0; n < count; n += 1) {
      const p = free(particles);
      if (!p) return;
      const a = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      p.active = true; p.x = x; p.y = y;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.life = p.maxLife = 0.35 + random() * 0.4;
      p.color = color; p.size = 2 + random() * 3;
    }
  }
  function spawnFloat(x, y, text, color) {
    const f = free(floats);
    if (!f) return;
    f.active = true; f.x = x; f.y = y; f.text = text; f.life = 1; f.color = color;
  }

  function towerAt(col, row) {
    for (const t of towers) if (t.active && t.col === col && t.row === row) return t;
    return null;
  }

  function reset() {
    for (const t of towers) t.active = false;
    for (const e of enemies) e.active = false;
    for (const p of projectiles) p.active = false;
    for (const p of particles) p.active = false;
    for (const f of floats) f.active = false;
    state.gold = START_GOLD; state.score = 0; state.kills = 0;
    state.coreHp = CORE_HP; state.wave = 0; state.phase = 'build';
    state.elapsed = 0; state.spawnTimer = 0; state.spawnIndex = 0; state.spawnList = [];
    state.selected = null; state.shop = 'arrow'; state.hover = null; state.waveKills = 0;
    time = 0;
  }

  function canPlace(col, row) {
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return false;
    if (isPathCell(col, row)) return false;
    return towerAt(col, row) === null;
  }

  function placeTower(type, col, row) {
    const def = TOWERS[type];
    if (!def || !canPlace(col, row) || state.gold < def.cost) return null;
    let slot = null;
    for (const t of towers) if (!t.active) { slot = t; break; }
    if (!slot) return null;
    const c = cellCenter(col, row);
    state.gold -= def.cost;
    slot.active = true; slot.id = nextTowerId; nextTowerId += 1;
    slot.type = type; slot.col = col; slot.row = row;
    slot.x = c.x; slot.y = c.y; slot.level = 1; slot.invested = def.cost;
    slot.cooldown = 0; slot.angle = -Math.PI / 2; slot.kills = 0;
    spawnParticle(c.x, c.y, def.color, 10, 90);
    return slot;
  }

  function upgradeTower(t) {
    if (!t || !t.active || t.level >= 3) return false;
    const cost = upgradeCost(t.type, t.level);
    if (state.gold < cost) return false;
    state.gold -= cost;
    t.level += 1; t.invested += cost;
    spawnParticle(t.x, t.y, '#f2c94c', 14, 110);
    return true;
  }

  function sellTower(t) {
    if (!t || !t.active) return 0;
    const refund = Math.round(t.invested * SELL_RATE);
    state.gold += refund;
    if (state.selected === t) state.selected = null;
    t.active = false;
    return refund;
  }

  function buildWaveList(wave) {
    const list = [];
    for (const [type, count] of WAVES[wave - 1]) {
      for (let i = 0; i < count; i += 1) list.push(type);
    }
    // Shuffle deterministically so the same seed stages the same wave.
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function startWave() {
    if (state.phase !== 'build' || state.wave >= TOTAL_WAVES) return false;
    state.wave += 1;
    state.phase = 'wave';
    state.spawnList = buildWaveList(state.wave);
    state.spawnIndex = 0;
    state.spawnTimer = 0.4;
    state.waveKills = 0;
    return true;
  }

  function spawnEnemy(type) {
    const e = free(enemies);
    if (!e) return;
    const def = ENEMIES[type];
    const hpMul = 1 + HP_PER_WAVE * (state.wave - 1);
    const spMul = 1 + SPEED_PER_WAVE * (state.wave - 1);
    e.active = true; e.type = type;
    e.maxHp = Math.round(def.hp * hpMul);
    e.hp = e.maxHp;
    e.x = PATH[0].x; e.y = PATH[0].y; e.wp = 1;
    e.speed = def.speed * spMul;
    e.slowUntil = 0; e.slowFactor = 1;
    e.r = def.r; e.gold = def.gold; e.leak = def.leak; e.dist = 0;
  }

  function damageEnemy(e, dmg, events) {
    e.hp -= dmg;
    if (e.hp > 0) return events;
    e.active = false;
    state.gold += e.gold;
    state.score += 10;
    state.kills += 1;
    state.waveKills += 1;
    spawnParticle(e.x, e.y, ENEMIES[e.type].color, 12, 130);
    spawnFloat(e.x, e.y - 14, `+${e.gold}g`, '#f2c94c');
    return events | EVENT_KILL;
  }

  function fireTower(t, target, events) {
    const st = towerStats(t.type, t.level);
    const p = free(projectiles);
    t.cooldown = 1 / st.rate;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    if (!p) return events;
    p.active = true; p.x = t.x; p.y = t.y;
    p.tx = target.x; p.ty = target.y; p.target = target;
    p.speed = t.type === 'cannon' ? 420 : 620;
    p.damage = st.damage; p.splash = st.splash;
    p.slow = st.slow; p.slowTime = st.slowTime;
    p.color = TOWERS[t.type].color; p.kind = t.type;
    return events | (t.type === 'frost' ? EVENT_FROST : t.type === 'cannon' ? EVENT_CANNON : EVENT_SHOOT);
  }

  function step(dt) {
    let events = 0;
    time += dt;
    state.elapsed += dt;

    // Spawning.
    if (state.phase === 'wave' && state.spawnIndex < state.spawnList.length) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnList[state.spawnIndex]);
        state.spawnIndex += 1;
        state.spawnTimer = SPAWN_INTERVAL * (0.85 + random() * 0.3);
      }
    }

    // Towers acquire (furthest along the path in range) and fire.
    for (const t of towers) {
      if (!t.active) continue;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const st = towerStats(t.type, t.level);
      let best = null;
      let bestDist = -1;
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        if (dx * dx + dy * dy > st.range * st.range) continue;
        if (e.dist > bestDist) { bestDist = e.dist; best = e; }
      }
      if (best) events = fireTower(t, best, events);
    }

    // Projectiles fly to their target's live position; dead targets fizzle.
    for (const p of projectiles) {
      if (!p.active) continue;
      const tgt = p.target && p.target.active ? p.target : null;
      const tx = tgt ? tgt.x : p.tx;
      const ty = tgt ? tgt.y : p.ty;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      if (d <= Math.max(stepLen, 6)) {
        p.active = false;
        if (tgt) {
          if (p.slow > 0) { tgt.slowFactor = 1 - p.slow; tgt.slowUntil = time + p.slowTime; }
          if (p.splash > 0) {
            spawnParticle(tx, ty, p.color, 10, 120);
            for (const e of enemies) {
              if (!e.active) continue;
              const ex = e.x - tx;
              const ey = e.y - ty;
              if (ex * ex + ey * ey <= p.splash * p.splash) events = damageEnemy(e, p.damage, events);
            }
          } else {
            events = damageEnemy(tgt, p.damage, events);
          }
        }
      } else {
        p.x += (dx / d) * stepLen;
        p.y += (dy / d) * stepLen;
      }
    }

    // Enemies walk the path; leaks cost core health.
    for (const e of enemies) {
      if (!e.active) continue;
      const slowed = time < e.slowUntil;
      const speed = e.speed * (slowed ? e.slowFactor : 1);
      let move = speed * dt;
      while (move > 0 && e.wp < PATH.length) {
        const wp = PATH[e.wp];
        const dx = wp.x - e.x;
        const dy = wp.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= move) {
          e.x = wp.x; e.y = wp.y; e.dist += d; move -= d; e.wp += 1;
        } else {
          e.x += (dx / d) * move; e.y += (dy / d) * move; e.dist += move; move = 0;
        }
      }
      if (e.wp >= PATH.length) {
        e.active = false;
        state.coreHp -= e.leak;
        state.score = Math.max(0, state.score - 25);
        spawnParticle(CORE.x, CORE.y, '#e5534b', 16, 150);
        spawnFloat(CORE.x, CORE.y - 40, `-${e.leak} core`, '#e5534b');
        events |= EVENT_LEAK;
        if (state.coreHp <= 0) {
          state.coreHp = 0;
          state.phase = 'lost';
          events |= EVENT_LOSE;
        }
      }
    }

    // Particles and floating text decay.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }
    for (const f of floats) {
      if (!f.active) continue;
      f.life -= dt * 0.8;
      f.y -= 24 * dt;
      if (f.life <= 0) f.active = false;
    }

    // Wave clear: spawns done, field empty.
    if (state.phase === 'wave') {
      let any = false;
      for (const e of enemies) if (e.active) { any = true; break; }
      if (state.spawnIndex >= state.spawnList.length && !any) {
        const bonus = WAVE_CLEAR_BONUS(state.wave);
        state.gold += bonus;
        state.score += state.wave * 100;
        spawnFloat(CORE.x, CORE.y - 60, `Wave clear +${bonus}g`, '#4ade80');
        events |= EVENT_WAVE_CLEAR;
        if (state.wave >= TOTAL_WAVES) {
          state.phase = 'won';
          state.score += state.coreHp * WIN_BONUS_PER_CORE_HP;
          events |= EVENT_WIN;
        } else {
          state.phase = 'build';
        }
      }
    }
    return events;
  }

  reset();
  return {
    state, reset, placeTower, upgradeTower, sellTower, startWave, step,
    towerAt, canPlace, towerStats, upgradeCost,
  };
}

// Autopilot build policy shared by the screenshot stager and the headless
// balance test: spend gold on good cells first, then upgrade what exists.
// Cells sit beside path bends so one tower covers two path segments.
export const AUTO_CELLS = [
  { col: 9, row: 2, type: 'cannon' }, { col: 2, row: 3, type: 'cannon' },
  { col: 9, row: 3, type: 'arrow' }, { col: 2, row: 5, type: 'arrow' },
  { col: 5, row: 2, type: 'frost' }, { col: 5, row: 5, type: 'frost' },
  { col: 10, row: 5, type: 'arrow' }, { col: 10, row: 6, type: 'cannon' },
  { col: 3, row: 6, type: 'arrow' }, { col: 7, row: 2, type: 'arrow' },
  { col: 7, row: 5, type: 'cannon' }, { col: 4, row: 6, type: 'frost' },
  { col: 10, row: 2, type: 'arrow' }, { col: 1, row: 5, type: 'arrow' },
];
export function autoSpend(world) {
  const s = world.state;
  for (const cell of AUTO_CELLS) {
    if (s.gold < TOWERS[cell.type].cost) continue;
    if (world.towerAt(cell.col, cell.row)) continue;
    world.placeTower(cell.type, cell.col, cell.row);
  }
  // Then upgrade the oldest towers while gold lasts.
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
export { TOWER_ORDER };
