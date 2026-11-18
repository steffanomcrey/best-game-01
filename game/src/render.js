// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred. All art is
// drawn shapes and canvas text: the game's own, no image assets, no network.
import { CORE, ENEMIES, FIELD, FONT, GRID, PALETTE, PATH, RELICS, SIDEBAR, TOWERS, TOWER_ORDER, TOTAL_WAVES, isPathCell } from './config.js';
import { towerStats, upgradeCost } from './world.js';

// Relic offer panel layout (logical pixels): a banner across the lower
// field with one card per offered relic. relicCardAt is the single source
// for these rectangles; the input side uses it for click picks.
export const RELIC_PANEL = { x: 120, y: 584, w: 720, h: 122 };
export function relicCardRect(index) {
  const cardW = 224;
  const gap = 16;
  return { x: RELIC_PANEL.x + 12 + index * (cardW + gap), y: RELIC_PANEL.y + 34, w: cardW, h: 76 };
}
export function relicCardAt(state, x, y) {
  if (!state.relicOffer) return -1;
  for (let i = 0; i < state.relicOffer.length; i += 1) {
    const r = relicCardRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

const LIFE = 20;

// Deterministic starfield, fixed at boot.
function makeStars(random) {
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, r: 0.6 + random() * 1.6, tw: random() * Math.PI * 2 });
  }
  return stars;
}

export function createRenderer(canvas, random) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const stars = makeStars(random);
  const fonts = new Map();
  function font(size) {
    if (!fonts.has(size)) fonts.set(size, `700 ${size}px ${FONT}`);
    return fonts.get(size);
  }
  function text(value, x, y, size, color, align, baseline) {
    context.font = font(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }
  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  function drawBackground(t) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const s of stars) {
      const a = 0.35 + 0.35 * Math.sin(t * 0.7 + s.tw);
      context.globalAlpha = a;
      context.fillStyle = '#c7d2fe';
      context.beginPath();
      context.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Nebula blobs.
    context.fillStyle = '#1b2452';
    context.beginPath(); context.arc(240, 130, 150, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#2a1b4d';
    context.beginPath(); context.arc(760, 560, 170, 0, Math.PI * 2); context.fill();
  }

  function drawGrid() {
    context.fillStyle = PALETTE.grid;
    context.fillRect(0, 0, GRID.width, FIELD.height);
    context.strokeStyle = PALETTE.gridLine;
    context.lineWidth = 1;
    for (let c = 0; c <= GRID.cols; c += 1) {
      context.beginPath(); context.moveTo(c * GRID.cell, 0); context.lineTo(c * GRID.cell, FIELD.height); context.stroke();
    }
    for (let r = 0; r <= GRID.rows; r += 1) {
      context.beginPath(); context.moveTo(0, r * GRID.cell); context.lineTo(GRID.width, r * GRID.cell); context.stroke();
    }
    // Path tiles.
    for (let c = 0; c < GRID.cols; c += 1) {
      for (let r = 0; r < GRID.rows; r += 1) {
        if (!isPathCell(c, r)) continue;
        context.fillStyle = PALETTE.path;
        context.fillRect(c * GRID.cell + 2, r * GRID.cell + 2, GRID.cell - 4, GRID.cell - 4);
      }
    }
    // Path direction chevrons.
    context.fillStyle = PALETTE.pathEdge;
    for (let i = 0; i < PATH.length - 1; i += 1) {
      const a = PATH[i];
      const b = PATH[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.floor(len / 80);
      for (let s = 1; s <= steps; s += 1) {
        const x = a.x + ((b.x - a.x) * s) / (steps + 1);
        const y = a.y + ((b.y - a.y) * s) / (steps + 1);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        context.save();
        context.translate(x, y);
        context.rotate(ang);
        context.beginPath();
        context.moveTo(8, 0); context.lineTo(-6, -8); context.lineTo(-6, 8); context.closePath();
        context.fill();
        context.restore();
      }
    }
  }

  function drawCore(state, t) {
    const pulse = 1 + 0.08 * Math.sin(t * 2.4);
    const glow = context.createRadialGradient(CORE.x, CORE.y, 4, CORE.x, CORE.y, 70 * pulse);
    glow.addColorStop(0, 'rgba(103,232,249,0.55)');
    glow.addColorStop(1, 'rgba(103,232,249,0)');
    context.fillStyle = glow;
    context.beginPath(); context.arc(CORE.x, CORE.y, 70 * pulse, 0, Math.PI * 2); context.fill();
    // Crystal: a faceted diamond.
    context.fillStyle = PALETTE.core;
    context.beginPath();
    context.moveTo(CORE.x, CORE.y - 30); context.lineTo(CORE.x + 20, CORE.y);
    context.lineTo(CORE.x, CORE.y + 30); context.lineTo(CORE.x - 20, CORE.y);
    context.closePath(); context.fill();
    context.strokeStyle = '#a5f3fc';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#ecfeff';
    context.beginPath();
    context.moveTo(CORE.x, CORE.y - 18); context.lineTo(CORE.x + 9, CORE.y);
    context.lineTo(CORE.x, CORE.y + 18); context.lineTo(CORE.x - 9, CORE.y);
    context.closePath(); context.fill();
    // Orbiting sparkles around the crystal.
    context.fillStyle = '#a5f3fc';
    for (let i = 0; i < 3; i += 1) {
      const a = t * 1.4 + (i * Math.PI * 2) / 3;
      const sx = CORE.x + Math.cos(a) * 46;
      const sy = CORE.y + Math.sin(a) * 34;
      context.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + i * 2.1);
      context.beginPath(); context.arc(sx, sy, 2.6, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    // Core health ring.
    context.strokeStyle = state.coreHp <= 5 ? PALETTE.danger : PALETTE.heal;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(CORE.x, CORE.y, 38, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * state.coreHp) / 20);
    context.stroke();
    text(`CORE ${state.coreHp}`, CORE.x, CORE.y + 52, 15, PALETTE.text, 'center');
  }

  function drawTowers(state) {
    for (const tw of state.towers) {
      if (!tw.active) continue;
      const def = TOWERS[tw.type];
      const cx = tw.x;
      const cy = tw.y;
      // Drop shadow.
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath(); context.ellipse(cx + 4, cy + 8, 26, 12, 0, 0, Math.PI * 2); context.fill();
      // Base.
      context.fillStyle = '#0d1330';
      context.beginPath(); context.arc(cx, cy, 26, 0, Math.PI * 2); context.fill();
      context.strokeStyle = def.color;
      context.lineWidth = 2;
      context.stroke();
      // Barrel / shape per type.
      context.save();
      context.translate(cx, cy);
      context.rotate(tw.angle);
      context.fillStyle = def.color;
      if (tw.type === 'arrow') {
        context.fillRect(0, -3, 26, 6);
        context.beginPath(); context.moveTo(30, 0); context.lineTo(18, -7); context.lineTo(18, 7); context.closePath(); context.fill();
      } else if (tw.type === 'frost') {
        context.fillRect(0, -4, 22, 8);
        context.beginPath(); context.arc(24, 0, 6, 0, Math.PI * 2); context.fill();
      } else {
        context.fillRect(-4, -8, 26, 16);
        context.beginPath(); context.arc(24, 0, 9, 0, Math.PI * 2); context.fill();
      }
      context.restore();
      // Level pips.
      for (let i = 0; i < tw.level; i += 1) {
        context.fillStyle = '#f2c94c';
        context.beginPath(); context.arc(cx - 12 + i * 12, cy + 30, 3.5, 0, Math.PI * 2); context.fill();
      }
      // Range ring for the selected tower.
      if (state.selected === tw) {
        const st = towerStats(tw.type, tw.level, state.relicMods);
        context.strokeStyle = 'rgba(242,201,76,0.7)';
        context.lineWidth = 2;
        context.setLineDash([8, 6]);
        context.beginPath(); context.arc(cx, cy, st.range, 0, Math.PI * 2); context.stroke();
        context.setLineDash([]);
      }
    }
    // Hover ghost: range + footprint for the shop type on a buildable cell.
    const hov = state.hover;
    if (hov && hov.col >= 0 && hov.col < GRID.cols) {
      const def = TOWERS[state.shop];
      const cx = hov.col * GRID.cell + GRID.cell / 2;
      const cy = hov.row * GRID.cell + GRID.cell / 2;
      context.globalAlpha = 0.35;
      context.strokeStyle = def.color;
      context.lineWidth = 2;
      context.beginPath(); context.arc(cx, cy, def.range, 0, Math.PI * 2); context.stroke();
      context.fillStyle = def.color;
      context.beginPath(); context.arc(cx, cy, 24, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      if (!e.active) continue;
      const def = ENEMIES[e.type];
      const slowed = e.slowUntil > 0 && state.elapsed < e.slowUntil;
      // Ground shadow, plus a pulsing void aura under the boss.
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath(); context.ellipse(e.x + 3, e.y + e.r * 0.75, e.r * 0.95, e.r * 0.42, 0, 0, Math.PI * 2); context.fill();
      if (e.type === 'boss') {
        const pulse = 1 + 0.1 * Math.sin(state.elapsed * 3.2);
        const aura = context.createRadialGradient(e.x, e.y, 4, e.x, e.y, 58 * pulse);
        aura.addColorStop(0, 'rgba(192,132,252,0.4)');
        aura.addColorStop(1, 'rgba(192,132,252,0)');
        context.fillStyle = aura;
        context.beginPath(); context.arc(e.x, e.y, 58 * pulse, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = slowed ? '#7dd3fc' : def.color;
      if (e.type === 'boss') {
        // Crown + bulk body.
        context.beginPath(); context.arc(e.x, e.y, e.r, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#f2c94c';
        context.beginPath();
        context.moveTo(e.x - 16, e.y - e.r + 2); context.lineTo(e.x - 8, e.y - e.r - 12);
        context.lineTo(e.x, e.y - e.r + 2); context.lineTo(e.x + 8, e.y - e.r - 12);
        context.lineTo(e.x + 16, e.y - e.r + 2); context.closePath(); context.fill();
        context.fillStyle = '#1e1b4b';
        context.beginPath(); context.arc(e.x - 9, e.y - 4, 4, 0, Math.PI * 2); context.arc(e.x + 9, e.y - 4, 4, 0, Math.PI * 2); context.fill();
      } else if (e.type === 'armored') {
        roundRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2, 6);
        context.fill();
        context.strokeStyle = '#e2e8f0';
        context.lineWidth = 2;
        context.stroke();
      } else if (e.type === 'swift') {
        context.beginPath();
        context.moveTo(e.x + e.r, e.y); context.lineTo(e.x - e.r, e.y - e.r * 0.7);
        context.lineTo(e.x - e.r * 0.4, e.y); context.lineTo(e.x - e.r, e.y + e.r * 0.7);
        context.closePath(); context.fill();
      } else {
        context.beginPath(); context.arc(e.x, e.y, e.r, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#1e1b4b';
        context.beginPath(); context.arc(e.x - 4, e.y - 2, 2.5, 0, Math.PI * 2); context.arc(e.x + 4, e.y - 2, 2.5, 0, Math.PI * 2); context.fill();
      }
      // Frost ring while a slow is active.
      if (slowed) {
        context.strokeStyle = 'rgba(125,211,252,0.85)';
        context.lineWidth = 2;
        context.beginPath(); context.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); context.stroke();
      }
      // HP bar.
      const w = e.type === 'boss' ? 64 : 30;
      const frac = Math.max(0, e.hp / e.maxHp);
      context.fillStyle = '#0b1026';
      context.fillRect(e.x - w / 2, e.y - e.r - 12, w, 5);
      context.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#facc15' : '#e5534b';
      context.fillRect(e.x - w / 2, e.y - e.r - 12, w * frac, 5);
      if (e.type === 'boss') text('VOID TYRANT', e.x, e.y - e.r - 18, 13, '#c084fc', 'center');
    }
  }

  function drawProjectiles(state) {
    for (const p of state.projectiles) {
      if (!p.active) continue;
      // Motion trail: a fading streak behind the shot, aimed at its target.
      const tx = p.target && p.target.active ? p.target.x : p.tx;
      const ty = p.target && p.target.active ? p.target.y : p.ty;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const trail = p.kind === 'cannon' ? 26 : 18;
      context.strokeStyle = p.color;
      context.globalAlpha = 0.55;
      context.lineWidth = p.kind === 'cannon' ? 5 : 3;
      context.beginPath();
      context.moveTo(p.x - (dx / d) * trail, p.y - (dy / d) * trail);
      context.lineTo(p.x, p.y);
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = p.color;
      context.beginPath(); context.arc(p.x, p.y, p.kind === 'cannon' ? 7 : 4, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 0.4;
      context.beginPath(); context.arc(p.x, p.y, p.kind === 'cannon' ? 12 : 7, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1;
    }
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
    for (const f of state.floats) {
      if (!f.active) continue;
      context.globalAlpha = Math.max(0, f.life);
      text(f.text, f.x, f.y, 16, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawTopBar(state, best) {
    context.fillStyle = 'rgba(11,16,38,0.92)';
    context.fillRect(0, 0, FIELD.width, 46);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, 46, FIELD.width, 2);
    text('STARLIGHT KEEP', 16, 31, 22, '#67e8f9', 'left');
    text(`Gold ${state.gold}`, 250, 31, 20, PALETTE.gold, 'left');
    text(`Score ${state.score}`, 400, 31, 20, PALETTE.text, 'left');
    const waveLabel = state.wave === 0 ? 'Wave - / 10' : `Wave ${state.wave} / ${TOTAL_WAVES}`;
    text(waveLabel, 580, 31, 20, PALETTE.text, 'left');
    text(`Core ${state.coreHp} / 20`, 760, 31, 20, state.coreHp <= 5 ? PALETTE.danger : PALETTE.heal, 'left');
    text(`Kills ${state.kills}`, 900, 31, 20, PALETTE.text, 'left');
    text(`Best ${best}`, 1050, 31, 20, PALETTE.muted, 'left');
  }

  function drawSidebar(state, ui) {
    const x = SIDEBAR.x;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, 46, SIDEBAR.width, FIELD.height - 46);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(x, 46, 2, FIELD.height - 46);
    let y = 66;
    text('BUILD  (1 / 2 / 3)', x + 16, y, 17, PALETTE.muted, 'left');
    y += 12;
    for (const type of TOWER_ORDER) {
      const def = TOWERS[type];
      const selected = state.shop === type;
      const afford = state.gold >= def.cost;
      roundRect(x + 12, y, SIDEBAR.width - 24, 74, 10);
      context.fillStyle = selected ? '#26306b' : '#1b2247';
      context.fill();
      context.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdge;
      context.lineWidth = selected ? 2.5 : 1.5;
      context.stroke();
      context.fillStyle = def.color;
      context.beginPath(); context.arc(x + 40, y + 37, 15, 0, Math.PI * 2); context.fill();
      text(def.name, x + 64, y + 26, 17, PALETTE.text, 'left');
      text(def.desc, x + 64, y + 48, 13, PALETTE.muted, 'left');
      text(`${def.cost}g  [${def.key}]`, x + SIDEBAR.width - 28, y + 26, 16, afford ? PALETTE.gold : PALETTE.danger, 'right');
      y += 84;
    }
    // Wave button.
    const waveReady = state.phase === 'build' && state.wave < TOTAL_WAVES;
    roundRect(x + 12, y, SIDEBAR.width - 24, 52, 10);
    context.fillStyle = waveReady ? '#14532d' : '#1b2247';
    context.fill();
    context.strokeStyle = waveReady ? '#4ade80' : PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    let waveText;
    if (state.phase === 'wave') {
      let alive = 0;
      for (const e of state.enemies) if (e.active) alive += 1;
      const left = alive + (state.spawnList.length - state.spawnIndex);
      waveText = `WAVE ${state.wave} RUNNING — ${left} LEFT`;
    } else {
      waveText = state.wave >= TOTAL_WAVES ? 'FINAL WAVE DONE' : `START WAVE ${state.wave + 1}  [Space]`;
    }
    text(waveText, x + SIDEBAR.width / 2, y + 33, 17, waveReady ? '#bbf7d0' : PALETTE.muted, 'center');
    y += 66;
    // Selected tower panel.
    const sel = state.selected;
    if (sel && sel.active) {
      const st = towerStats(sel.type, sel.level, state.relicMods);
      const cost = upgradeCost(sel.type, sel.level);
      text('SELECTED TOWER', x + 16, y, 15, PALETTE.muted, 'left');
      y += 26;
      text(`${TOWERS[sel.type].name}  Lv ${sel.level}`, x + 16, y, 18, PALETTE.text, 'left');
      y += 26;
      text(`Damage ${Math.round(st.damage)}   Range ${Math.round(st.range)}`, x + 16, y, 15, PALETTE.muted, 'left');
      y += 24;
      text(`Rate ${st.rate}/s   Kills ${sel.kills}`, x + 16, y, 15, PALETTE.muted, 'left');
      y += 30;
      roundRect(x + 12, y, 140, 40, 8);
      context.fillStyle = cost !== null && state.gold >= cost ? '#713f12' : '#1b2247';
      context.fill();
      text(cost === null ? 'MAX LEVEL' : `UPGRADE ${cost}g [U]`, x + 82, y + 26, 14, PALETTE.text, 'center');
      roundRect(x + 164, y, 132, 40, 8);
      context.fillStyle = '#3f1d1d';
      context.fill();
      text(`SELL +${Math.round(sel.invested * 0.7)}g [X]`, x + 230, y + 26, 14, PALETTE.text, 'center');
      y += 56;
    } else {
      text('Click a tower to inspect it,', x + 16, y + 6, 14, PALETTE.muted, 'left');
      text('upgrade it or sell it.', x + 16, y + 26, 14, PALETTE.muted, 'left');
      y += 40;
    }
    // Help.
    text('HOW TO PLAY', x + 16, y + 14, 15, PALETTE.muted, 'left');
    const help = [
      'Place towers on glowing tiles.',
      'Enemies follow the purple road',
      'to the crystal. If it falls,',
      'the Keep falls with it.',
      'Clear a wave, draft 1 of 3',
      'relics: damage, range, speed,',
      'chill, gold or a core heal.',
      'Clear wave 10 and slay the',
      'Void Tyrant to win.',
      'P pause    R restart',
    ];
    help.forEach((line, i) => text(line, x + 16, y + 40 + i * 20, 14, PALETTE.muted, 'left'));
    if (ui.muted) text('MUTED', x + SIDEBAR.width - 16, 66, 14, PALETTE.danger, 'right');
  }

  // Owned relics as chips in a row under the top bar, over the field.
  function drawRelicChips(state) {
    if (!state.relics.length) return;
    let x = 10;
    const y = 54;
    for (const id of state.relics) {
      const def = RELICS[id];
      const w = 26 + def.name.length * 8.2;
      roundRect(x, y, w, 26, 13);
      context.fillStyle = 'rgba(11,16,38,0.88)';
      context.fill();
      context.strokeStyle = def.color;
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = def.color;
      context.beginPath(); context.arc(x + 14, y + 13, 6, 0, Math.PI * 2); context.fill();
      text(def.name.toUpperCase(), x + 25, y + 17, 12, PALETTE.text, 'left');
      x += w + 8;
    }
  }

  // The between-wave draft: three relic cards on a banner over the lower
  // field. Drawn last among the play layers so it sits above the battle.
  function drawRelicOffer(state) {
    if (!state.relicOffer) return;
    const p = RELIC_PANEL;
    roundRect(p.x, p.y, p.w, p.h, 14);
    context.fillStyle = 'rgba(8,11,28,0.94)';
    context.fill();
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.stroke();
    text('WAVE CLEARED — CHOOSE A RELIC', p.x + p.w / 2, p.y + 24, 17, PALETTE.gold, 'center');
    for (let i = 0; i < state.relicOffer.length; i += 1) {
      const def = RELICS[state.relicOffer[i]];
      const r = relicCardRect(i);
      roundRect(r.x, r.y, r.w, r.h, 10);
      context.fillStyle = '#1b2247';
      context.fill();
      context.strokeStyle = def.color;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = def.color;
      context.beginPath(); context.arc(r.x + 24, r.y + 26, 11, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#0b1026';
      context.beginPath(); context.arc(r.x + 24, r.y + 26, 5, 0, Math.PI * 2); context.fill();
      text(def.name, r.x + 44, r.y + 24, 16, PALETTE.text, 'left');
      text(`press ${i + 4} or click`, r.x + 44, r.y + 44, 12, PALETTE.muted, 'left');
      text(def.desc, r.x + 12, r.y + 66, 13, def.color, 'left');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(5,8,20,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    roundRect(x, y, width, height, 16);
    context.fillStyle = PALETTE.panel;
    context.fill();
    context.strokeStyle = accent || PALETTE.core;
    context.lineWidth = 2;
    context.stroke();
    text(title, FIELD.width / 2, y + 72, 46, accent || PALETTE.core, 'center');
    lines.forEach((line, i) => text(line, FIELD.width / 2, y + 118 + i * 34, 20, PALETTE.muted, 'center'));
    text(prompt, FIELD.width / 2, y + height - 34, 20, PALETTE.gold, 'center');
  }

  function draw(state, screen, best, ui) {
    const t = state.elapsed;
    context.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(t);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawGrid();
    drawCore(state, t);
    drawTowers(state);
    drawEnemies(state);
    drawProjectiles(state);
    // Soft vignette over the field for depth (sidebar and HUD stay crisp).
    const vignette = context.createRadialGradient(480, 360, 260, 480, 360, 720);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, GRID.width, FIELD.height);
    drawTopBar(state, best);
    drawSidebar(state, ui || {});
    drawRelicChips(state);
    if (screen === SCREEN_PLAY) drawRelicOffer(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('STARLIGHT KEEP', [
        'The Void sends its swarm down the old road.',
        'Build towers, hold the crystal, survive 10 waves.',
        'Arrow, Frost and Cannon, each upgradable to level 3.',
        'Every cleared wave drafts a relic: bend the run.',
        `Best score ${best}`,
      ], 'Press Space or click to play', '#67e8f9');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The swarm waits. The crystal holds its light.'], 'Press P to resume', '#f2c94c');
    } else if (screen === SCREEN_OVER) {
      drawPanel('THE KEEP HAS FALLEN', [
        `Wave ${state.wave} of ${TOTAL_WAVES}    Score ${state.score}    Kills ${state.kills}`,
        `Best score ${best}`,
      ], 'Press Space or click to try again', '#e5534b');
    } else if (screen === SCREEN_WON) {
      drawPanel('THE KEEP STANDS', [
        `All 10 waves cleared    Score ${state.score}    Kills ${state.kills}`,
        `Core health ${state.coreHp} / 20    Best score ${best}`,
      ], 'Press Space or click to play again', '#4ade80');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical, view };
}
