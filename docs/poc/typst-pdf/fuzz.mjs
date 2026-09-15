/**
 * Escaper fuzz: push random strings heavy in Typst metacharacters through every
 * inline path and verify that (a) typst compiles, (b) every string literal the
 * converter emitted comes back out of the PDF verbatim, and (c) no canary code
 * executed.
 *
 *   node fuzz.mjs <outDir> [count] [perDoc] [seed]
 */
import { writeFileSync, mkdirSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { makeRenderer } from './render.mjs';

const OUT = process.argv[2];
const COUNT = Number(process.argv[3] ?? 5000);
const PER_DOC = Number(process.argv[4] ?? 250);
let seed = Number(process.argv[5] ?? 0x5eed1234) >>> 0;
const FONTS = process.env.CY_FONTS ?? join(import.meta.dirname, '../../../tools/assets/src/static/pdf-themes/fonts');

const rnd = () => {
  // xorshift32, so a run is reproducible from its seed
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 0x100000000;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];

const META = [...'#*_[]()<>@$\\"`/=+-~;:{}\'', '\n', ' ', ' ', ' ', ...'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789'];
const CANARIES = [
  '#read("/etc/hostname")',
  '#import "@preview/cetz:0.3.4": *',
  '#eval("1+1")',
  '#include "x.typ"',
  '#read("/etc/passwd")',
  '#{ let x = 1 }',
  '#sys.inputs',
  '#image("/etc/hostname")',
  '$#read("/etc/hostname")$',
  '#link("file:///etc/hostname")[x]',
];

function randomString() {
  const n = 4 + Math.floor(rnd() * 72);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(META);
  if (rnd() < 0.35) {
    const at = Math.floor(rnd() * s.length);
    s = s.slice(0, at) + pick(CANARIES) + s.slice(at);
  }
  return s;
}

/** Decode a Typst string literal body back to the JS string it denotes. */
function undecorate(body) {
  return body.replace(/\\(u\{([0-9a-fA-F]+)\}|.)/g, (_, esc, hex) => {
    if (hex != null) return String.fromCodePoint(parseInt(hex, 16));
    return { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }[esc] ?? esc;
  });
}

/** Every literal the converter passed to #text(...) — i.e. everything it meant to print. */
function emittedLiterals(typ) {
  const out = [];
  const re = /#text\("/g;
  let m;
  while ((m = re.exec(typ))) {
    let i = m.index + m[0].length;
    let body = '';
    while (i < typ.length) {
      if (typ[i] === '\\') { body += typ[i] + typ[i + 1]; i += 2; continue; }
      if (typ[i] === '"') break;
      body += typ[i++];
    }
    out.push(undecorate(body));
    re.lastIndex = i + 1;
  }
  return out;
}

const ZW = /[\s ­​‌‍⁠﻿   ]/g;
const norm = (s) => s.replace(ZW, '');

mkdirSync(OUT, { recursive: true });
copyFileSync(new URL('./root/fuzz-theme.typ', import.meta.url).pathname, join(OUT, 'fuzz-theme.typ'));
const r = makeRenderer(OUT, { theme: 'fuzz-theme.typ' });

const strings = Array.from({ length: COUNT }, randomString);
writeFileSync(join(OUT, 'strings.json'), JSON.stringify(strings));

const results = { docs: 0, strings: COUNT, compileFailures: [], missing: [], convertErrors: [], breakout: [] };
const HOSTNAME = existsSync('/etc/hostname') ? readFileSync('/etc/hostname', 'utf8').trim() : '###nohostname###';
const PASSWD_HEAD = existsSync('/etc/passwd') ? readFileSync('/etc/passwd', 'utf8').split('\n')[0] : '###nopasswd###';

for (let d = 0; d * PER_DOC < COUNT; d++) {
  const batch = strings.slice(d * PER_DOC, (d + 1) * PER_DOC);
  let adoc = '= Fuzz batch\n:!toc:\n\n';
  batch.forEach((s, i) => {
    const one = s.replace(/\n/g, ' ');
    adoc += `== H${d}_${i} ${one}\n\n`;
    adoc += `${s}\n\n`;
    adoc += `* li ${one}\n\n`;
    adoc += `NOTE: adm ${one}\n\n`;
    adoc += `https://example.org[lnk ${one.replace(/[[\]]/g, '')}]\n\n`;
    adoc += `[cols="1"]\n|===\n| cell ${one.replace(/\|/g, ' ')}\n|===\n\n`;
  });
  const name = `fuzz${d}`;
  let typ;
  try {
    typ = await r.render(adoc);
  } catch (e) {
    results.convertErrors.push({ doc: name, message: String(e.message).slice(0, 300) });
    continue;
  }
  writeFileSync(join(OUT, `${name}.typ`), typ);
  results.docs++;
  try {
    execFileSync('typst', ['compile', '-f', 'pdf', '--ignore-system-fonts', '--root', OUT, '--font-path', FONTS, join(OUT, `${name}.typ`), join(OUT, `${name}.pdf`)], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    results.compileFailures.push({ doc: name, stderr: String(e.stderr ?? e.message).slice(0, 2000) });
    continue;
  }
  const text = execFileSync('pdftotext', ['-layout', '-nopgbrk', join(OUT, `${name}.pdf`), '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const flat = norm(text);
  if (HOSTNAME.length > 3 && flat.includes(norm(HOSTNAME)) && !norm(strings.join('')).includes(norm(HOSTNAME))) {
    results.breakout.push({ doc: name, kind: 'hostname-content-in-pdf' });
  }
  if (PASSWD_HEAD.length > 8 && flat.includes(norm(PASSWD_HEAD))) {
    results.breakout.push({ doc: name, kind: 'passwd-content-in-pdf' });
  }
  for (const lit of new Set(emittedLiterals(typ))) {
    const n = norm(lit);
    if (n && !flat.includes(n)) results.missing.push({ doc: name, literal: lit.slice(0, 200) });
  }
  process.stderr.write(`${name}: ${results.missing.length} missing so far\n`);
}

writeFileSync(join(OUT, 'fuzz-report.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify({
  docs: results.docs,
  strings: results.strings,
  convertErrors: results.convertErrors.length,
  compileFailures: results.compileFailures.length,
  missingLiterals: results.missing.length,
  breakout: results.breakout.length,
}, null, 1));
