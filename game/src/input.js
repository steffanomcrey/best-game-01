// Keyboard and pointer input. Held keys are not needed here; one-shot presses
// (start wave, pause, upgrade, sell, mute, restart) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost.
import { TOWER_ORDER } from './config.js';

export const ACTION_CONFIRM = 1; // Space / Enter: start wave, or start/restart
export const ACTION_PAUSE = 2;
export const ACTION_UPGRADE = 4;
export const ACTION_SELL = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;
export const ACTION_DESELECT = 64;

const SHOP_KEYS = new Map([['Digit1', 'arrow'], ['Digit2', 'frost'], ['Digit3', 'cannon']]);

export function createInput(canvas, toLogical) {
  let actions = 0;
  let shop = null; // tower type picked by a number key, consumed by main
  const clicks = []; // queued logical {x,y} clicks
  let mouse = { x: -1, y: -1 };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (SHOP_KEYS.has(event.code)) { shop = SHOP_KEYS.get(event.code); event.preventDefault(); return; }
    switch (event.code) {
      case 'Space': case 'Enter': actions |= ACTION_CONFIRM; break;
      case 'KeyP': case 'Escape': actions |= event.code === 'Escape' ? ACTION_DESELECT : ACTION_PAUSE; break;
      case 'KeyU': actions |= ACTION_UPGRADE; break;
      case 'KeyX': actions |= ACTION_SELL; break;
      case 'KeyM': actions |= ACTION_MUTE; break;
      case 'KeyR': actions |= ACTION_RESTART; break;
      default: return;
    }
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse = toLogical(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    clicks.push(p);
    mouse = p;
  });
  window.addEventListener('blur', () => { mouse = { x: -1, y: -1 }; });

  return {
    mouse() { return mouse; },
    takeClicks() { return clicks.splice(0, clicks.length); },
    takeShop() { const s = shop; shop = null; return s; },
    takeActions() { const taken = actions; actions = 0; return taken; },
  };
}
export { TOWER_ORDER };
