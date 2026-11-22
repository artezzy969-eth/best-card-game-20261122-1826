// Ember Court — entry point for the make.fun harness.
// Copies the game (and screenshots, when they exist) into the output
// directory and writes dossier.json there. Node standard library only;
// no dependencies, no build step, no network access.
//
// The output directory comes from MAKEFUN_OUTPUT_DIR, or /output when
// that is unset. Only the *contents* of the output directory are
// cleared; the directory itself is never removed, so a mounted
// output path stays mounted.
//
// Deterministic: the same repository always produces the same bytes.
// The dossier is built with the kit's buildDossier library, so the
// dossier.json written here is exactly the one the scorer recomputes
// from the same game/ and screenshots/ — once screenshots exist.
// Before any screenshots exist, buildDossier refuses (an entry hands
// in 3 or 4 renders), so a clearly-marked placeholder dossier is
// written instead; re-run this program after adding screenshots and
// the real dossier replaces it.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DossierError } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the bounty gate uses for this competition.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Clear only the contents of the output directory, never the
// directory itself.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

// The game itself.
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

// Screenshots, when the maker has taken them.
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

let dossier: Uint8Array;
try {
  dossier = buildDossier(outDir, caps);
} catch (err) {
  if (err instanceof DossierError && /screenshots/.test(err.message)) {
    // No screenshots yet: the gate cannot build a real dossier, so
    // write a deterministic placeholder in the same shape and let
    // the next run (with screenshots present) write the real one.
    const placeholder = {
      cover: 0,
      images: [],
      placeholder: 'no screenshots yet',
      schema: 'makefun/dossier/v1',
      text: '## Game\n\nNo screenshots yet.\n',
    };
    dossier = Buffer.from(JSON.stringify(placeholder), 'utf8');
  } else {
    throw err;
  }
}
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Ember Court: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
