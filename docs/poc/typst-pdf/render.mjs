/**
 * Driver: AsciiDoc text -> Typst source, with the same preprocessing the
 * production path would use.
 */
import * as core from '@asciidoctor/core';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerTypst, resolveXrefs, sanitizeSource, stripMacros } from './typst-converter.mjs';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp' };

/**
 * @param {string} outDir directory that becomes the Typst --root
 */
const LOGO_SRC = join(import.meta.dirname, '../../../tools/assets/src/static/pdf-themes/img/cyberismo-logo.png');

export function makeRenderer(outDir, { stripCyberismoMacros = true, theme = 'theme.typ', logo = true } = {}) {
  mkdirSync(outDir, { recursive: true });
  let logoName = null;
  if (logo && existsSync(LOGO_SRC)) {
    logoName = 'cyberismo-logo.png';
    copyFileSync(LOGO_SRC, join(outDir, logoName));
  }
  const unhandled = new Map();
  let pending = [];
  const imageSink = (mime, buf) => {
    const ext = EXT[mime];
    if (!ext) return null;
    const name = `img-${createHash('sha1').update(buf).digest('hex').slice(0, 16)}.${ext}`;
    writeFileSync(join(outDir, name), buf);
    return name;
  };
  const nodes = new Map();
  registerTypst(core, {
    theme,
    logo: logoName,
    imageSink,
    onNode: (t) => nodes.set(t, (nodes.get(t) ?? 0) + 1),
    onUnhandled: (t) => {
      unhandled.set(t, (unhandled.get(t) ?? 0) + 1);
      pending.push(t);
    },
  });

  const api = {
    unhandled,
    nodes,
    /** Node types reported unhandled during the most recent render() call. */
    last: [],
    async render(adoc, attributes = {}) {
      pending = [];
      let src = sanitizeSource(adoc);
      if (stripCyberismoMacros) src = stripMacros(src);
      const out = await core.convert(src, {
        backend: 'typst',
        safe: 'secure',
        standalone: true,
        attributes: { 'source-highlighter': null, ...attributes },
      });
      api.last = pending;
      return resolveXrefs(String(out));
    },
  };
  return api;
}
