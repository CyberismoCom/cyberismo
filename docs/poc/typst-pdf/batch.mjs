/**
 * Batch run: concatenate the whole corpus into ONE document the way
 * Export#toAdocFileAsContent does (one `== title` per card) and convert it once.
 * This is the shape a real `cyberismo export pdf` produces.
 *
 *   node batch.mjs <outDir> <repoRoot>...
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename, dirname } from 'node:path';
import { makeRenderer } from './render.mjs';

const OUT = process.argv[2];
const ROOTS = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
copyFileSync(new URL('./root/theme.typ', import.meta.url).pathname, join(OUT, 'theme.typ'));

const files = [];
for (const root of ROOTS) {
  for (const f of execFileSync('find', [root, '-name', 'index.adoc', '-not', '-path', '*/node_modules/*'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n')) {
    if (f) files.push(f);
  }
}
files.sort();
if (process.env.CY_LIMIT) files.length = Math.min(files.length, Number(process.env.CY_LIMIT));

let doc = `= Cyberismo corpus export\n:doctype: book\n:toc: macro\n:numbered:\n:toclevels: 5\n\ntoc::[]\n\n`;
for (const f of files) {
  const card = basename(dirname(f));
  doc += `== ${card}\n\n`;
  doc += readFileSync(f, 'utf8');
  doc += '\n\n';
}
writeFileSync(join(OUT, 'corpus.adoc'), doc);

const r = makeRenderer(OUT);
const t0 = Date.now();
const typ = await r.render(doc);
const ms = Date.now() - t0;
writeFileSync(join(OUT, 'corpus.typ'), typ);
console.log(`${files.length} cards, ${doc.length} adoc bytes -> ${typ.length} typst bytes in ${(ms / 1000).toFixed(1)}s`);
console.log('unhandled:', Object.fromEntries(r.unhandled));
