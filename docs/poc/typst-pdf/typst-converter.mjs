/**
 * Typst backend for @asciidoctor/core — proof of concept.
 *
 * Evaluation prototype only: not production code, no Cyberismo copyright header.
 *
 * Design
 * ------
 * Asciidoctor hands a block converter its inline content as ONE already-substituted
 * string: text runs interleaved with whatever the inline converters returned, with
 * HTML entities applied. We therefore make the inline converters emit sentinel-
 * delimited markers, and have `typst()` re-parse that string, confining every text
 * run to a Typst *string literal* via `tstr()`.
 *
 * `tstr()` is the entire security boundary: nothing that came from card content
 * ever reaches Typst code mode or markup mode, so `#read("/etc/passwd")`,
 * `#import "@preview/..."`, `#eval(..)` and friends are inert text.
 */

// ── The security boundary ────────────────────────────────────────────────────

/**
 * Render an arbitrary JS string as a Typst string literal.
 *
 * Typst string literals accept exactly these escapes: \\ \" \n \r \t \u{..}.
 * JSON.stringify is NOT a valid substitute — it emits \b, \f and \uXXXX, none of
 * which Typst accepts. Everything else is passed through verbatim, which is safe
 * because a literal cannot be terminated without an unescaped `"`.
 */
export function tstr(s) {
  const src = String(s ?? '');
  let out = '"';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const c = src.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += `\\u{${c.toString(16)}}`;
    else if (c >= 0xd800 && c <= 0xdbff) {
      // High surrogate: keep the pair, drop a lone one (not encodable as UTF-8).
      const n = src.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) {
        out += ch + src[i + 1];
        i++;
      } else out += '�';
    } else if (c >= 0xdc00 && c <= 0xdfff) out += '�';
    else out += ch;
  }
  return out + '"';
}

/** Typst label / identifier: restricted charset, never empty. */
export function tlabel(s) {
  const v = String(s ?? '').replace(/[^A-Za-z0-9_\-.:]/g, '_');
  return v ? (/^[A-Za-z_]/.test(v) ? v : `x${v}`) : 'x_';
}

// ── Source preprocessing ─────────────────────────────────────────────────────

/** Sentinels used to delimit inline markers (private use area). */
const SOH = '';
const STX = '';
const ETX = '';

/**
 * Strip Cyberismo handlebars macro blocks. These are NOT AsciiDoc: in production
 * they are evaluated in Node *before* asciidoctor runs, so a converter never sees
 * them. For the corpus run over raw card sources we remove them with a regex.
 */
export function stripMacros(src) {
  return String(src)
    .replace(/\{\{#(\w+)\}\}[\s\S]*?\{\{\/\1\}\}/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '');
}

/**
 * Remove the sentinel code points and stray C0 controls from the source.
 * Required: a card that contains U+E000..U+E002 could otherwise desynchronise the
 * marker parser. (Everything still ends up inside a string literal, so this is
 * robustness, not the last line of defence.)
 */
export function sanitizeSource(src) {
  // eslint-disable-next-line no-control-regex
  return String(src).replace(/[-]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

// ── Inline marker protocol ───────────────────────────────────────────────────

const mark = (kind, attrs, inner) =>
  `${SOH}${kind}|${JSON.stringify(attrs)}${STX}${inner ?? ''}${ETX}`;

const decodeEntities = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const INLINE_RENDERERS = {
  strong: (a, inner) => `#strong[${inner}]`,
  emphasis: (a, inner) => `#emph[${inner}]`,
  monospaced: (a, inner) => `#raw-inline[${inner}]`,
  mark: (a, inner) => `#highlight[${inner}]`,
  superscript: (a, inner) => `#super[${inner}]`,
  subscript: (a, inner) => `#sub[${inner}]`,
  double: (a, inner) => `#text("\\u{201c}")${inner}#text("\\u{201d}")`,
  single: (a, inner) => `#text("\\u{2018}")${inner}#text("\\u{2019}")`,
  link: (a, inner) => `#link(${tstr(a.target)})[${inner}]`,
  xref: (a, inner) => `#xref(${tstr(a.refid)})[${inner}]`,
  footnote: (a, inner) => `#footnote[${inner}]`,
  linebreak: () => `#linebreak()`,
  kbd: (a) => `#box(stroke: 0.5pt, inset: (x: 3pt), radius: 2pt)[${a.keys.map((k) => `#raw-inline[#text(${tstr(k)})]`).join('#text("+")')}]`,
  button: (a, inner) => `#box(stroke: 0.5pt, inset: (x: 3pt), radius: 2pt)[#strong[${inner}]]`,
  callout: (a) => `#super[#text(${tstr(`(${a.n})`)})]`,
  image: (a) =>
    a.file
      ? `#box(baseline: 25%, image(${tstr(a.file)}, height: 1em))`
      : `#text(fill: rgb("#b00"))[#text(${tstr(`[${a.alt ?? 'image'}]`)})]`,
  ref: (a) => `#box(width: 0pt)<${a.id}>`,
  none: (a, inner) => inner,
};

/**
 * Parse a substituted inline string back into Typst markup.
 *
 * @param {string} s substituted inline content
 * @param {{ breaks?: boolean }} opts breaks: emit #linebreak() for newlines
 */
export function typst(s, opts = {}) {
  const src = String(s ?? '');
  let pos = 0;

  const emitText = (raw) => {
    const t = decodeEntities(raw);
    if (!t) return '';
    if (!opts.breaks) return `#text(${tstr(t)})`;
    return t
      .split('\n')
      .map((line) => `#text(${tstr(line)})`)
      .join('#linebreak()');
  };

  const parse = () => {
    let out = '';
    while (pos < src.length) {
      const c = src[pos];
      if (c === ETX) {
        pos++;
        return out;
      }
      if (c === SOH) {
        const end = src.indexOf(STX, pos);
        const bar = src.indexOf('|', pos);
        if (end === -1 || bar === -1 || bar > end) {
          // Desynchronised marker: treat as literal text (fail safe).
          out += emitText(c);
          pos++;
          continue;
        }
        const kind = src.slice(pos + 1, bar);
        let attrs;
        try {
          attrs = JSON.parse(src.slice(bar + 1, end));
        } catch {
          out += emitText(c);
          pos++;
          continue;
        }
        pos = end + 1;
        const inner = parse();
        out += (INLINE_RENDERERS[kind] ?? INLINE_RENDERERS.none)(attrs, inner);
        continue;
      }
      let j = pos;
      while (j < src.length && src[j] !== SOH && src[j] !== ETX) j++;
      out += emitText(src.slice(pos, j));
      pos = j;
    }
    return out;
  };

  return parse();
}

// ── Converter ────────────────────────────────────────────────────────────────

/**
 * Build a TypstConverter class bound to a set of options.
 *
 * @param {object} core the @asciidoctor/core module namespace
 * @param {object} options
 *   imageSink(mime, buffer) -> filename|null  where to put embedded images
 *   onUnhandled(type)                         reporting hook
 *   theme                                     theme module name, default "theme.typ"
 */
export function makeTypstConverter(core, options = {}) {
  const { ConverterBase } = core;
  const imageSink = options.imageSink ?? (() => null);
  const onUnhandled = options.onUnhandled ?? (() => {});
  const onNode = options.onNode ?? (() => {});
  const themeModule = options.theme ?? 'theme.typ';
  const logo = options.logo ?? null;

  const note = (type) => {
    onUnhandled(type);
    return `// unhandled: ${type}\n`;
  };

  const title = (node) => (node.hasTitle() ? `#block(above: 0.6em, below: 0.3em)[#strong[${typst(node.getTitle())}]]\n` : '');

  /**
   * Content of a container block. Asciidoctor gives `simple` blocks their
   * substituted inline text (markers and all) and `compound` blocks the already
   * converted children, so the two must not be treated the same.
   */
  const blockContent = async (node) => {
    const model = node.getContentModel?.();
    if (model === 'verbatim' || model === 'raw') {
      return `#raw(block: true, ${tstr(node.getSource())})`;
    }
    const c = await node.getContent();
    if (model === 'simple') return `#par[${typst(c)}]`;
    return c;
  };

  const anchor = (node) => {
    const id = node.getId?.();
    return id ? ` <${tlabel(id)}>` : '';
  };

  return class TypstConverter extends ConverterBase {
    constructor(backend, opts) {
      super(backend, opts);
      this.basebackend = 'typst';
      this.outfilesuffix = '.pdf';
      this.filetype = 'pdf';
      this.labels = new Set();
    }

    async convert(node, transform) {
      const t = transform ?? node.getNodeName();
      onNode(t);
      const fn = this[`convert_${t}`];
      return fn ? fn.call(this, node) : note(t);
    }

    // ── document skeleton ──────────────────────────────────────────────────
    async convert_document(node) {
      const attrs = [
        `title: ${tstr(node.getDoctitle() ?? '')}`,
        `author: ${tstr(node.getAttribute('author') ?? '')}`,
        `revnumber: ${tstr(node.getAttribute('revnumber') ?? '')}`,
        `revdate: ${tstr(node.getAttribute('revdate') ?? '')}`,
        `revremark: ${tstr(node.getAttribute('revremark') ?? '')}`,
        `numbered: ${node.hasAttribute('sectnums') || node.hasAttribute('numbered') ? 'true' : 'false'}`,
        `book: ${node.getDoctype() === 'book' ? 'true' : 'false'}`,
        `logo: ${logo ? tstr(logo) : 'none'}`,
      ].join(', ');
      const body = await node.getContent();
      const footnotes = ''; // footnotes are inline in Typst
      return `#import ${tstr(themeModule)}: *\n#show: cyberismo.with(${attrs})\n${body}${footnotes}`;
    }

    async convert_embedded(node) {
      return node.getContent();
    }

    async convert_preamble(node) {
      return node.getContent();
    }

    async convert_section(node) {
      const lvl = Math.min(Math.max(node.getLevel(), 1), 6);
      const id = tlabel(node.getId());
      this.labels.add(id);
      return `#heading(level: ${lvl})[${typst(node.getTitle())}] <${id}>\n\n${await node.getContent()}\n`;
    }

    async convert_floating_title(node) {
      const lvl = Math.min(Math.max(node.getLevel(), 1), 6);
      return `#heading(level: ${lvl}, numbering: none, outlined: false)[${typst(node.getTitle())}]${anchor(node)}\n\n`;
    }

    async convert_outline() {
      return ''; // Typst builds its own outline
    }

    async convert_toc(node) {
      const doc = node.getDocument();
      if (!doc.hasAttribute('toc')) return '';
      const levels = node.getAttribute('levels') ?? doc.getAttribute('toclevels') ?? 2;
      return `#outline(depth: ${Number.parseInt(levels, 10) || 2})\n#pagebreak(weak: true)\n\n`;
    }

    // ── flow blocks ────────────────────────────────────────────────────────
    async convert_paragraph(node) {
      return `${title(node)}#par[${typst(await node.getContent())}]${anchor(node)}\n\n`;
    }

    async convert_admonition(node) {
      const label = node.getAttribute('textlabel') ?? node.getAttribute('name') ?? '';
      return `#cy-admonition(${tstr(label)})[${title(node)}${await blockContent(node)}]${anchor(node)}\n\n`;
    }

    async convert_example(node) {
      return `#block(width: 100%, inset: 8pt, stroke: (left: 2pt + gray))[${title(node)}${await blockContent(node)}]\n\n`;
    }

    async convert_sidebar(node) {
      return `#block(width: 100%, inset: 8pt, fill: luma(240))[${title(node)}${await blockContent(node)}]\n\n`;
    }

    async convert_open(node) {
      return `#block(width: 100%)[${title(node)}${await blockContent(node)}]\n\n`;
    }

    async convert_quote(node) {
      const attribution = node.getAttribute('attribution');
      const cite = node.getAttribute('citetitle');
      const foot = attribution || cite
        ? `\n#align(right)[#text(size: 0.9em)[#text(${tstr(`— ${[attribution, cite].filter(Boolean).join(', ')}`)})]]`
        : '';
      return `#quote(block: true)[${await blockContent(node)}${foot}]\n\n`;
    }

    async convert_verse(node) {
      const text = node.getContentModel?.() === 'compound' ? await node.getContent() : `#par[${typst(node.getSource(), { breaks: true })}]`;
      return `#block(width: 100%)[${title(node)}${text}]\n\n`;
    }

    async convert_thematic_break() {
      return `#line(length: 100%, stroke: 0.5pt + gray)\n\n`;
    }

    async convert_page_break() {
      return `#pagebreak(weak: true)\n\n`;
    }

    // ── verbatim ───────────────────────────────────────────────────────────
    async convert_listing(node) {
      const lang = node.getAttribute('language');
      const langArg = lang ? `lang: ${tstr(lang)}, ` : '';
      return `${title(node)}#raw(block: true, ${langArg}${tstr(node.getSource())})${anchor(node)}\n\n`;
    }

    async convert_literal(node) {
      return `${title(node)}#raw(block: true, ${tstr(node.getSource())})${anchor(node)}\n\n`;
    }

    async convert_stem(node) {
      // asciimath/latexmath have no native Typst equivalent; rendering them would
      // need a package (mitex/xarrow) — out of scope, shown verbatim instead.
      onUnhandled(`stem:${node.getStyle() ?? 'unknown'}`);
      return `#block(inset: 6pt, fill: luma(245), width: 100%)[#raw(block: true, ${tstr(node.getSource())})]\n\n`;
    }

    async convert_pass(node) {
      // Passthrough is raw backend markup (HTML). There is no safe mapping to
      // Typst, and rendering it as text would leak HTML into the PDF: drop it.
      onUnhandled('pass');
      void node;
      return '';
    }

    // ── lists ──────────────────────────────────────────────────────────────
    async #listItems(node) {
      const out = [];
      for (const item of node.getItems()) {
        const text = typst(await item.getText());
        const blocks = item.hasBlocks() ? await item.getContent() : '';
        out.push(`[${text}${blocks ? `\n${blocks}` : ''}]`);
      }
      return out;
    }

    async convert_ulist(node) {
      const checklist = node.hasOption('checklist');
      const items = [];
      for (const item of node.getItems()) {
        let text = await item.getText();
        let marker = '';
        if (checklist && item.hasAttribute('checkbox')) {
          marker = item.hasAttribute('checked') ? '#text("\\u{2611} ")' : '#text("\\u{2610} ")';
        }
        const blocks = item.hasBlocks() ? await item.getContent() : '';
        items.push(`[${marker}${typst(text)}${blocks ? `\n${blocks}` : ''}]`);
      }
      if (!items.length) return '';
      return `${title(node)}#list(${items.join(', ')})${anchor(node)}\n\n`;
    }

    async convert_olist(node) {
      const items = await this.#listItems(node);
      if (!items.length) return '';
      const start = node.getAttribute('start');
      const startArg = start ? `start: ${Number.parseInt(start, 10) || 1}, ` : '';
      return `${title(node)}#enum(${startArg}${items.join(', ')})${anchor(node)}\n\n`;
    }

    async convert_colist(node) {
      const items = await this.#listItems(node);
      if (!items.length) return '';
      return `#enum(${items.join(', ')})\n\n`;
    }

    async convert_dlist(node) {
      const rows = [];
      for (const [terms, dd] of node.getItems()) {
        const term = terms.map((dt) => typst(dt.getText())).join('#text(", ")');
        let desc = '';
        if (dd) {
          if (dd.hasText()) desc += typst(await dd.getText());
          if (dd.hasBlocks()) desc += `\n${await dd.getContent()}`;
        }
        rows.push(`terms.item([${term}], [${desc}])`);
      }
      if (!rows.length) return '';
      return `${title(node)}#terms(${rows.join(', ')})${anchor(node)}\n\n`;
    }

    // ── tables ─────────────────────────────────────────────────────────────
    async convert_table(node) {
      const cols = node.getColumns?.() ?? node.columns ?? [];
      const n = cols.length || 1;
      const widths = cols.length
        ? cols
            .map((c) => {
              const w = Number(c.getAttribute?.('colpcwidth') ?? c.attributes?.colpcwidth);
              return Number.isFinite(w) && w > 0 ? `${w}fr` : '1fr';
            })
            .join(', ')
        : '1fr';
      const parts = [`columns: (${widths})`];
      const frame = node.getAttribute('frame', 'all');
      const grid = node.getAttribute('grid', 'all');
      parts.push(`stroke: ${grid === 'none' && frame === 'none' ? 'none' : '0.5pt + luma(200)'}`);

      const sections = node.rows?.bySection?.() ?? [];
      const body = [];
      for (const [sec, rows] of sections) {
        if (!rows.length) continue;
        const cells = [];
        for (const row of rows) {
          for (const cell of row) {
            let inner;
            if (sec === 'head' || cell.style === 'header') {
              inner = `#strong[${typst(cell.getText())}]`;
            } else if (cell.style === 'asciidoc') {
              inner = await cell.getContent();
            } else if (cell.style === 'literal') {
              inner = `#raw(block: true, ${tstr(cell.getText())})`;
            } else {
              const parts2 = await cell.getContent();
              inner = (Array.isArray(parts2) ? parts2 : [parts2])
                .filter(Boolean)
                .map((p) => `#par[${typst(p)}]`)
                .join('');
            }
            const opts = [];
            if (cell.colspan) opts.push(`colspan: ${cell.colspan}`);
            if (cell.rowspan) opts.push(`rowspan: ${cell.rowspan}`);
            cells.push(opts.length ? `table.cell(${opts.join(', ')})[${inner}]` : `[${inner}]`);
          }
        }
        body.push(sec === 'head' ? `table.header(${cells.join(', ')})` : cells.join(', '));
      }
      if (!body.length) return '';
      void n;
      // Role-driven styling: [.cyberismo-meta] renders through the theme's
      // metadata-grid helper instead of the generic table.
      const role = node.getRole?.() ?? '';
      if (String(role).split(/\s+/).includes('cyberismo-meta')) {
        return `#cy-meta(${body.join(', ')})${anchor(node)}\n\n`;
      }
      return `${title(node)}#table(${parts.join(', ')}, ${body.join(', ')})${anchor(node)}\n\n`;
    }

    // ── media ──────────────────────────────────────────────────────────────
    #embedImage(target) {
      const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(target ?? ''));
      if (!m) return null;
      let buf;
      try {
        buf = Buffer.from(m[2], 'base64');
      } catch {
        return null;
      }
      if (!buf.length) return null;
      return imageSink(m[1], buf);
    }

    async convert_image(node) {
      const file = this.#embedImage(node.getAttribute('target'));
      if (!file) {
        onUnhandled('image:non-data-uri');
        return `#cy-dropped(${tstr(node.getAttribute('alt') ?? 'image')})\n\n`;
      }
      const width = node.getAttribute('pdfwidth') ?? node.getAttribute('width');
      const w = /^\d+%$/.test(String(width)) ? `width: ${width}, ` : '';
      const cap = node.hasTitle() ? `#figure(image(${tstr(file)}, ${w}), caption: [${typst(node.getTitle())}])` : `#align(center)[#image(${tstr(file)}, ${w})]`;
      return `${cap}${anchor(node)}\n\n`;
    }

    async convert_audio() {
      onUnhandled('audio');
      return `#cy-dropped("audio")\n\n`;
    }

    async convert_video() {
      onUnhandled('video');
      return `#cy-dropped("video")\n\n`;
    }

    // ── inline ─────────────────────────────────────────────────────────────
    async convert_inline_quoted(node) {
      return mark(node.getType(), {}, await node.getText());
    }

    async convert_inline_anchor(node) {
      const type = node.getType();
      if (type === 'xref') {
        const refid = node.getAttribute('refid') ?? node.getTarget();
        const text = node.getText() ?? String(refid ?? '');
        return mark('xref', { refid: tlabel(refid) }, text);
      }
      if (type === 'ref') {
        const id = tlabel(node.getId());
        this.labels.add(id);
        return mark('ref', { id }, '');
      }
      if (type === 'bibref') {
        const id = tlabel(node.getId());
        this.labels.add(id);
        return `${mark('ref', { id }, '')}${mark('none', {}, `[${node.getId()}]`)}`;
      }
      return mark('link', { target: node.getTarget() }, node.getText() ?? node.getTarget());
    }

    async convert_inline_break(node) {
      return `${mark('none', {}, await node.getText())}${mark('linebreak', {}, '')}`;
    }

    async convert_inline_button(node) {
      return mark('button', {}, await node.getText());
    }

    async convert_inline_callout(node) {
      return mark('callout', { n: node.getText() }, '');
    }

    async convert_inline_footnote(node) {
      const text = node.getText();
      if (text == null) return mark('none', {}, '');
      return mark('footnote', {}, text);
    }

    async convert_inline_image(node) {
      if (node.getType() === 'icon') {
        onUnhandled('inline_image:icon');
        return mark('none', {}, `[${node.getAlt() ?? 'icon'}]`);
      }
      const file = this.#embedImage(node.getTarget());
      if (!file) onUnhandled('inline_image:non-data-uri');
      return mark('image', { file, alt: node.getAlt() }, '');
    }

    async convert_inline_indexterm(node) {
      return node.getType() === 'visible' ? mark('none', {}, await node.getText()) : '';
    }

    async convert_inline_kbd(node) {
      const keys = node.getAttribute('keys');
      return mark('kbd', { keys: Array.isArray(keys) ? keys : [String(keys)] }, '');
    }

    async convert_inline_menu(node) {
      const menu = node.getAttribute('menu');
      const submenus = node.getAttribute('submenus') ?? [];
      const item = node.getAttribute('menuitem');
      const path = [menu, ...submenus, item].filter(Boolean).join(' › ');
      return mark('none', {}, path);
    }
  };
}

/**
 * Post-pass: turn #xref("id") into a real link when the label exists in the
 * document, into plain text when it does not. Typst errors out on a link to a
 * missing or duplicated label, and card content routinely cross-references cards
 * that are not part of the export.
 */
export function resolveXrefs(source, labels) {
  const seen = new Map();
  for (const m of source.matchAll(/<([A-Za-z_][A-Za-z0-9_\-.:]*)>/g)) {
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  if (labels) for (const l of labels) if (!seen.has(l)) seen.set(l, 0);
  return source.replace(/#xref\("((?:[^"\\]|\\.)*)"\)/g, (_, id) =>
    seen.get(id) === 1 ? `#link(label("${id}"))` : '#cy-deadxref',
  );
}

/** Register the converter on a core module, returning the class. */
export function registerTypst(core, options = {}) {
  const Cls = makeTypstConverter(core, options);
  core.ConverterFactory.register(Cls, 'typst');
  return Cls;
}
