// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Requires the two-line SPDX header that `reuse annotate --template cyberismo`
// writes: first thing in the file, after a shebang and one blank line.
// The fix replaces the legacy "Cyberismo / Copyright ©" AGPL block and stray
// copies of our own SPDX tags, and touches nothing else.
// A comment carrying any other SPDX copyright or licence is reported and never
// rewritten.

const SPDX_TAGS =
  /SPDX-(FileCopyrightText|License-Identifier):[ \t]*([^\r\n]*)/g;
const isLegacy = (text) => /Cyberismo Ltd/.test(text) && /Affero/.test(text);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          copyright: { type: 'string' },
          license: { type: 'string' },
        },
        required: ['copyright', 'license'],
        additionalProperties: false,
      },
    ],
    messages: {
      missing: 'Missing or malformed SPDX header; expected:\n{{header}}',
      legacy: 'Replace the legacy AGPL header block with the SPDX header.',
      stray: 'SPDX tag outside the file header.',
      foreign:
        'SPDX {{kind}} "{{value}}" is not ours ("{{expected}}"). If this file is third-party, ignore it in eslint.config.js instead.',
    },
  },
  create(context) {
    const { copyright, license } = context.options[0];
    const source = context.sourceCode;

    return {
      Program() {
        const text = source.text;
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        // REUSE-IgnoreStart
        const header =
          `// SPDX-FileCopyrightText: ${copyright}${eol}` +
          `// SPDX-License-Identifier: ${license}${eol}`;
        // REUSE-IgnoreEnd
        const shebang = /^#![^\r\n]*(\r?\n)?/.exec(text)?.[0] ?? '';
        const prefix = shebang
          ? `${shebang.replace(/\r?\n$/, '')}${eol}${eol}`
          : '';
        const headerOk =
          text.startsWith(prefix + header) &&
          /^(\r?\n[^\r\n]|(\r?\n)?$)/.test(
            text.slice((prefix + header).length),
          );
        const headerEnd = headerOk ? (prefix + header).length : 0;

        const comments = source
          .getAllComments()
          .filter((c) => c.type !== 'Shebang' && c.range[0] >= headerEnd);

        // Our own tags are replaced; any other holder or licence stops the fix.
        const legacy = [];
        const stray = [];
        for (const c of comments) {
          if (isLegacy(c.value)) legacy.push(c);
          let ours = false;
          for (const [, kind, raw] of c.value.matchAll(SPDX_TAGS)) {
            const value = raw.trim();
            const expected =
              kind === 'License-Identifier' ? license : copyright;
            if (value !== expected) {
              context.report({
                loc: c.loc,
                messageId: 'foreign',
                data: { kind, value, expected },
              });
              return;
            }
            ours = true;
          }
          if (ours) stray.push(c);
        }
        if (headerOk && legacy.length === 0 && stray.length === 0) return;

        // Comments to drop: legacy blocks, stray tag comments, and empty `//`
        // lines directly adjacent to a dropped comment (separators of the old
        // header, e.g. reuse's default template).
        const drop = new Set([...legacy, ...stray]);
        const emptyLines = comments.filter(
          (c) => c.type === 'Line' && !c.value.trim(),
        );
        const adjacent = (a, b) =>
          /^[ \t]*\r?\n[ \t]*$/.test(text.slice(a.range[1], b.range[0]));
        for (let grew = true; grew;) {
          grew = false;
          for (const e of emptyLines) {
            if (drop.has(e)) continue;
            for (const d of drop) {
              if (adjacent(d, e) || adjacent(e, d)) {
                drop.add(e);
                grew = true;
                break;
              }
            }
          }
        }

        const fix = (fixer) => {
          let body = '';
          let pos = headerOk ? headerEnd : shebang.length;
          for (const c of [...drop].sort((a, b) => a.range[0] - b.range[0])) {
            if (c.range[0] < pos) continue;
            body += text.slice(pos, c.range[0]);
            pos = c.range[1];
            // The rest of the comment's line goes with it.
            const rest = /^[ \t]*\r?\n/.exec(text.slice(pos));
            if (rest) pos += rest[0].length;
            // Do not leave two blank lines where one block stood.
            if (/(^|\n)[ \t]*\r?\n$/.test(body) || body === '') {
              const blanks = /^(?:[ \t]*\r?\n)+/.exec(text.slice(pos));
              if (blanks) pos += blanks[0].length;
            }
          }
          body += text.slice(pos);
          // Leading blank lines only; the first line keeps its indentation.
          body = body.replace(/^(?:[ \t]*\r?\n)+/, '');
          return fixer.replaceTextRange(
            [0, text.length],
            prefix + header + (body ? eol + body : ''),
          );
        };

        if (!headerOk) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missing',
            data: { header: header.trimEnd() },
            fix,
          });
        } else if (legacy.length) {
          context.report({ loc: legacy[0].loc, messageId: 'legacy', fix });
        } else {
          context.report({ loc: stray[0].loc, messageId: 'stray', fix });
        }
      },
    };
  },
};
