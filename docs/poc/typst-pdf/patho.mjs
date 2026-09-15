/**
 * Pathological inputs: generate one case, convert it, report conversion cost.
 * Compile the resulting .typ separately under /usr/bin/time (one at a time).
 *
 *   node patho.mjs <outDir> <case>
 *   case = table10k | para5mb | nest200 | img500
 */
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { makeRenderer } from './render.mjs';

const OUT = process.argv[2];
const CASE = process.argv[3];
mkdirSync(OUT, { recursive: true });
copyFileSync(new URL('./root/theme.typ', import.meta.url).pathname, join(OUT, 'theme.typ'));

function png(seed, size = 8) {
  const w = size, h = size;
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w * 3; x++) raw.push((x * 7 + y * 13 + seed * 31) & 0xff);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crcTable = png.crcTable ??= Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    let c = 0xffffffff;
    for (const b of body) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let adoc = '= Pathological\n:!toc:\n\n';
if (CASE === 'table10k') {
  adoc += '[cols="1,2,3"]\n|===\n';
  for (let i = 0; i < 10000; i++) adoc += `| r${i} | value ${i} with *bold* | some longer descriptive text for row ${i}\n`;
  adoc += '|===\n';
} else if (CASE === 'para5mb') {
  const word = 'lorem ipsum dolor sit amet consectetur ';
  adoc += word.repeat(Math.ceil((5 * 1024 * 1024) / word.length)) + '\n';
} else if (CASE === 'nest200') {
  for (let d = 1; d <= 200; d++) adoc += `${'*'.repeat(d)} level ${d}\n`;
} else if (CASE === 'img500') {
  for (let i = 0; i < 500; i++) adoc += `image::data:image/png;base64,${png(i).toString('base64')}[]\n\n`;
} else if (CASE === 'img500big') {
  for (let i = 0; i < 500; i++) adoc += `image::data:image/png;base64,${png(i, 512).toString('base64')}[]\n\n`;
} else {
  console.error('unknown case');
  process.exit(2);
}

const r = makeRenderer(OUT);
const t0 = Date.now();
const typ = await r.render(adoc);
const ms = Date.now() - t0;
writeFileSync(join(OUT, `${CASE}.typ`), typ);
console.log(`${CASE}: adoc ${adoc.length} B -> typst ${typ.length} B, convert ${(ms / 1000).toFixed(2)} s`);
