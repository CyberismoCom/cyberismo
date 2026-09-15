/**
 * Negative control: prove the fuzz harness detects a broken escaper.
 *
 * Emits the same #text(...) shape but interpolates the raw string instead of
 * escaping it (the mistake a naive implementation makes), then compiles and
 * checks the canaries. Expect: compile errors and/or /etc/hostname content in
 * the PDF.
 *
 *   node negative-control.mjs <outDir>
 */
import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = process.argv[2];
const FONTS = process.env.CY_FONTS ?? join(import.meta.dirname, '../../../tools/assets/src/static/pdf-themes/fonts');
mkdirSync(OUT, { recursive: true });
copyFileSync(new URL('./root/fuzz-theme.typ', import.meta.url).pathname, join(OUT, 'fuzz-theme.typ'));

const payloads = {
  benign: 'plain text, no metacharacters',
  'file-read': '")] #read("/etc/hostname") #par[#text("',
  'package-import': '")]\n#import "@preview/cetz:0.3.4": *\n#par[#text("cetz loaded: " + str(type(canvas)))]\n#par[#text("',
  'root-escape-relative': '")] #par[#text(read("../../../../etc/hostname"))] #par[#text("',
  'root-escape-absolute': '")] #par[#text(read("/etc/hostname"))] #par[#text("',
  eval: '")] #par[#text(str(eval("6*7")))] #par[#text("',
  'quote-escape': 'quote breakout: " + read("/etc/hostname") + "',
};

const host = readFileSync('/etc/hostname', 'utf8').trim();
const out = {};
for (const [name, payload] of Object.entries(payloads)) {
  const typ = `#import "fuzz-theme.typ": *\n#show: cyberismo.with(title: "negative control")\n#par[#text("${payload}")]\n`;
  writeFileSync(join(OUT, `neg-${name}.typ`), typ);
  let compiled = true;
  let stderr = '';
  try {
    execFileSync('typst', ['compile', '-f', 'pdf', '--ignore-system-fonts', '--root', OUT, '--font-path', FONTS, join(OUT, `neg-${name}.typ`), join(OUT, `neg-${name}.pdf`)], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    compiled = false;
    stderr = String(e.stderr ?? e.message).split('\n').slice(0, 3).join(' ');
  }
  let text = '';
  if (compiled) text = execFileSync('pdftotext', ['-nopgbrk', join(OUT, `neg-${name}.pdf`), '-'], { encoding: 'utf8' });
  out[name] = {
    compiled,
    hostnameLeaked: compiled && host.length > 3 && text.includes(host),
    evalExecuted: compiled && /\b42\b/.test(text),
    packageLoaded: compiled && /cetz loaded/.test(text),
    stderr,
  };
}
console.log(JSON.stringify(out, null, 1));
