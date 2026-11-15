// Starlight Keep: the best-game-01 entrypoint (Node 22, standard library only).
//
// The game lives in game/ beside this file: plain static files that a desktop
// browser opens offline (game/index.html plus its ES modules, no library, no
// network request). This program hands the game in: it copies game/ and
// screenshots/ into the grader's output directory and writes dossier.json,
// the summary the judge reads, using the vendored make.fun library in
// vendor/makefun-game.ts.
//
// Run it locally with MAKEFUN_OUTPUT_DIR set, e.g.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and play the game itself with `node serve.ts` on http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps from the kit's gate: only text_max_bytes shapes the
// dossier's bytes. The rest refuse an entry the scorer would refuse, so this
// program fails in the same places: at most 4 screenshots of 256 KiB each,
// at most 993 entries and 48 MiB under game/, no game/ path over 1000 bytes
// (game/ shares the grader's 1000-entry output cap with screenshots/ and
// dossier.json, which is why the game cap is 993 and not 1000).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function main() {
  const repoRoot = fileURLToPath(new URL('.', import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  mkdirSync(outDir, { recursive: true });
  copyTree(join(repoRoot, 'game'), join(outDir, 'game'));

  const shotsDir = join(repoRoot, 'screenshots');
  if (existsSync(shotsDir)) {
    copyTree(shotsDir, join(outDir, 'screenshots'));
  } else {
    mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  }

  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

main();
