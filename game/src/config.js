// Starlight Keep: every tuning number and colour in one place.
// Logical playfield 1280x720. Left 960px is the build grid (12x9 cells of
// 80px); right 320px is the sidebar (shop, wave, selected tower).
// The enemy path snakes through the grid and ends at the crystal core.

export const FIELD = { width: 1280, height: 720 };
export const GRID = { cols: 12, rows: 9, cell: 80, width: 960 };
export const SIDEBAR = { x: 960, width: 320 };

export const STEP = 1 / 60;
export const START_GOLD = 180;
export const CORE_HP = 20;
export const TOTAL_WAVES = 10;
export const SELL_RATE = 0.7;
export const WIN_BONUS_PER_CORE_HP = 50;

// Path waypoints in pixels, from off-screen left to the core cell.
export const PATH = [
  { x: -40, y: 120 },
  { x: 840, y: 120 },
  { x: 840, y: 360 },
  { x: 120, y: 360 },
  { x: 120, y: 600 },
  { x: 920, y: 600 },
];
export const CORE = { x: 920, y: 600, r: 30 };

// Cells the path occupies (col,row), computed from PATH segments.
export const PATH_CELLS = (() => {
  const cells = new Set();
  const key = (c, r) => `${c},${r}`;
  for (let i = 0; i < PATH.length - 1; i += 1) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / GRID.cell;
    for (let s = 0; s <= steps; s += 1) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      cells.add(key(Math.floor(x / GRID.cell), Math.floor(y / GRID.cell)));
    }
  }
  cells.add(key(11, 7)); // core cell
  return cells;
})();
export function isPathCell(col, row) {
  return PATH_CELLS.has(`${col},${row}`);
}

export const TOWERS = {
  arrow: {
    name: 'Arrow Spire', key: '1', cost: 50, range: 135, damage: 14, rate: 2.4,
    color: '#ffd166', desc: 'Fast bolts, single target',
  },
  frost: {
    name: 'Frost Obelisk', key: '2', cost: 75, range: 115, damage: 5, rate: 1.1,
    slow: 0.45, slowTime: 1.6, color: '#7dd3fc', desc: 'Chills: enemies slow 45%',
  },
  cannon: {
    name: 'Star Cannon', key: '3', cost: 120, range: 155, damage: 34, rate: 0.7,
    splash: 62, color: '#f472b6', desc: 'Splash damage in a burst',
  },
};
export const TOWER_ORDER = ['arrow', 'frost', 'cannon'];
// Level multipliers: level 2 costs 75% of base, level 3 costs 150% of base.
export const UPGRADE = [
  null,
  { costMul: 0.75, dmgMul: 1.6, rangeAdd: 15 },
  { costMul: 1.5, dmgMul: 2.6, rangeAdd: 30 },
];

export const ENEMIES = {
  mite: { name: 'Mite', hp: 30, speed: 76, gold: 6, leak: 1, r: 11, color: '#a3e635' },
  grunt: { name: 'Grunt', hp: 78, speed: 52, gold: 9, leak: 1, r: 14, color: '#fb923c' },
  swift: { name: 'Swift', hp: 48, speed: 108, gold: 10, leak: 1, r: 10, color: '#facc15' },
  armored: { name: 'Bulwark', hp: 240, speed: 36, gold: 16, leak: 2, r: 17, color: '#94a3b8' },
  boss: { name: 'Void Tyrant', hp: 2800, speed: 30, gold: 250, leak: 10, r: 30, color: '#c084fc' },
};
export const HP_PER_WAVE = 0.22; // enemy hp grows 22% per wave
export const SPEED_PER_WAVE = 0.015;

// Wave compositions: [type, count] pairs. Wave 10 is the boss + escort.
export const WAVES = [
  [['mite', 8]],
  [['mite', 10], ['grunt', 4]],
  [['grunt', 10], ['mite', 8]],
  [['swift', 8], ['grunt', 8]],
  [['armored', 5], ['grunt', 10], ['mite', 8]],
  [['swift', 12], ['armored', 4], ['grunt', 8]],
  [['armored', 8], ['swift', 10], ['grunt', 10]],
  [['armored', 10], ['swift', 12], ['grunt', 12]],
  [['armored', 12], ['swift', 14], ['grunt', 10], ['mite', 10]],
  [['boss', 1], ['armored', 6], ['swift', 8]],
];
export const SPAWN_INTERVAL = 0.85;
export const WAVE_CLEAR_BONUS = (wave) => 25 + 5 * wave;

// Relics: clearing a wave offers a choice of 3 relics the player does not
// own yet; picking one applies its modifier for the rest of the run. The
// offer waits (it never blocks the next wave) until the player clicks a
// card or presses 4 / 5 / 6. Modifiers stack multiplicatively where the
// field is a *Mul, additively where it is an *Add; aegis heals at once.
export const RELICS = {
  emberheart: { name: 'Ember Heart', color: '#fb7185', desc: 'All towers deal +20% damage', dmgMul: 1.2 },
  farlens: { name: 'Far Lens', color: '#a5b4fc', desc: 'All towers gain +15% range', rangeMul: 1.15 },
  overclock: { name: 'Overclock Sigil', color: '#facc15', desc: 'All towers fire 20% faster', rateMul: 1.2 },
  deepchill: { name: 'Deep Chill', color: '#7dd3fc', desc: 'Frost slow deepens by +15%', slowAdd: 0.15 },
  gilded: { name: 'Gilded Sigil', color: '#f2c94c', desc: 'Kills pay +50% gold', goldMul: 1.5 },
  aegis: { name: 'Aegis Shard', color: '#4ade80', desc: 'Restore 5 core health now', heal: 5 },
};
export const RELIC_ORDER = ['emberheart', 'farlens', 'overclock', 'deepchill', 'gilded', 'aegis'];
export const RELIC_OFFER_SIZE = 3;

export const PALETTE = {
  backdrop: '#0b1026', sky: '#101736', grid: '#1a2350', gridLine: '#232c5e',
  path: '#3b2f6b', pathEdge: '#574a94', core: '#67e8f9', coreGlow: '#22d3ee',
  gold: '#f2c94c', text: '#eef1f5', muted: '#9aa3c0', panel: '#171d3d',
  panelEdge: '#2b3568', danger: '#e5534b', heal: '#4ade80',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'starlight-keep.best';
