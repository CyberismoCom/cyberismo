/**
 * Corpus run: convert every card index.adoc in the Cyberismo content repos and
 * report unhandled node types, JS exceptions and (optionally) typst failures.
 *
 *   node corpus.mjs <outDir> [repoRoot...]
 *
 * Writes <outDir>/typ/<n>.typ plus <outDir>/report.json. Keep outDir out of the
 * docs tree — the per-file .typ output is large.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename, dirname } from 'node:path';
import { makeRenderer } from './render.mjs';

const OUT = process.argv[2];
const ROOTS = process.argv.slice(3);
if (!OUT || !ROOTS.length) {
  console.error('usage: node corpus.mjs <outDir> <repoRoot>...');
  process.exit(2);
}
const TYP = join(OUT, 'typ');
mkdirSync(TYP, { recursive: true });
copyFileSync(new URL('./root/theme.typ', import.meta.url).pathname, join(TYP, 'theme.typ'));

const files = [];
for (const root of ROOTS) {
  const out = execFileSync('find', [root, '-name', 'index.adoc', '-not', '-path', '*/node_modules/*'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  for (const f of out.split('\n')) if (f) files.push(f);
}
files.sort();
console.error(`${files.length} card files`);

const r = makeRenderer(TYP);
const unhandled = new Map();
const errors = [];
const index = [];
let converted = 0;
let bytesIn = 0;
const t0 = Date.now();

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  let src;
  try {
    src = readFileSync(f, 'utf8');
  } catch (e) {
    errors.push({ file: f, phase: 'read', message: String(e.message) });
    continue;
  }
  bytesIn += src.length;
  const name = `c${String(i).padStart(5, '0')}.typ`;
  try {
    const typ = await r.render(src);
    writeFileSync(join(TYP, name), typ);
    converted++;
    for (const t of r.last) unhandled.set(t, (unhandled.get(t) ?? 0) + 1);
    index.push({ n: name, file: f, unhandled: [...new Set(r.last)] });
  } catch (e) {
    errors.push({ file: f, phase: 'convert', message: String(e && e.message).slice(0, 300), stack: String(e && e.stack).split('\n').slice(0, 3).join(' | ') });
  }
  if (i % 250 === 0) console.error(`  ${i}/${files.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

const ms = Date.now() - t0;
const report = {
  files: files.length,
  converted,
  bytesIn,
  convertMs: ms,
  msPerFile: +(ms / files.length).toFixed(2),
  unhandled: Object.fromEntries([...unhandled.entries()].sort((a, b) => b[1] - a[1])),
  nodes: Object.fromEntries([...r.nodes.entries()].sort((a, b) => b[1] - a[1])),
  errors,
  index,
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.error(`converted ${converted}/${files.length} in ${(ms / 1000).toFixed(1)}s; ${errors.length} exceptions`);
console.error('unhandled:', report.unhandled);
void basename;
void dirname;
