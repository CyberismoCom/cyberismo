// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Checks that every source file we own starts with the two-line SPDX header,
// and can add or repair it. Configuration files carry no header; the root
// LICENSE covers them.
//
//   pnpm lint-headers    report (also part of `pnpm lint`)
//   pnpm fix-headers     insert missing headers and repair their spacing
//
// A header that is not ours is reported and never rewritten; the exit code is
// non-zero while any file is left unfixed.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const COPYRIGHT = 'Cyberismo Ltd and contributors';
const LICENSE = 'AGPL-3.0-only';

// Repository-relative path prefixes (a trailing `/` is a directory) that carry
// no header: vendored third-party code, content projects, fixtures, generated
// files. Git submodules are not listed; `git ls-files` does not descend into
// them. Static assets under tools/assets/src (scaffolding, templates, fonts)
// are skipped too, except the .ts sources.
const EXCLUDES = [
  'tools/node-clingo/external/',
  'docs/',
  'module-test/',
  'tools/data-handler/test/test-data/',
  'pnpm-lock.yaml',
];
const ASSETS = 'tools/assets/src/';

const isExcluded = (path) =>
  EXCLUDES.some((prefix) => path.startsWith(prefix)) ||
  (path.startsWith(ASSETS) && !path.endsWith('.ts'));

const STYLES = {
  slash: (lines) => lines.map((l) => `// ${l}`),
  hash: (lines) => lines.map((l) => `# ${l}`),
  percent: (lines) => lines.map((l) => `% ${l}`),
  block: (lines) => ['/*', ...lines.map((l) => ` * ${l}`), ' */'],
  html: (lines) => ['<!--', ...lines, '-->'],
};

const BY_EXT = {
  '.ts': 'slash',
  '.tsx': 'slash',
  '.js': 'slash',
  '.mjs': 'slash',
  '.cjs': 'slash',
  '.cc': 'slash',
  '.h': 'slash',
  '.css': 'block',
  '.html': 'html',
  '.lp': 'percent',
  '.sh': 'hash',
};

function styleOf(path, shebang) {
  const name = basename(path);
  if (BY_EXT[extname(name)]) return BY_EXT[extname(name)];
  if (shebang && extname(name) === '') {
    return /\bnode\b/.test(shebang) ? 'slash' : 'hash';
  }
  return undefined;
}

const NOTICE = /SPDX-|Copyright|©|Permission is hereby|Licensed under/i;

// The comment lines (and blank lines) the file opens with.
function leadingComments(text) {
  const lines = [];
  let inBlock = false;
  for (const line of text.split('\n')) {
    const opens = /^\s*(?:\/\*|<!--)/.test(line);
    const closes = /\*\/|-->/.test(line);
    if (inBlock || opens || /^\s*(?:\/\/|#|%)/.test(line) || !line.trim()) {
      lines.push(line);
      inBlock = (inBlock || opens) && !closes;
    } else {
      break;
    }
  }
  return lines.join('\n');
}

/**
 * The text a file should have: its own text if the header is fine, otherwise
 * the text with the header inserted. Returns `{ problem }` for a header that
 * is not ours.
 */
function expected(path, text) {
  const shebang = /^#![^\n]*/.exec(text)?.[0];
  const style = styleOf(path, shebang);
  if (!style) return { fixed: text };
  const header =
    STYLES[style]([
      `SPDX-FileCopyrightText: ${COPYRIGHT}`,
      `SPDX-License-Identifier: ${LICENSE}`,
    ]).join('\n') + '\n';
  const compose = (body) =>
    (shebang ? shebang + '\n' : '') + header + (body ? '\n' + body : '');
  const rest = text.slice(shebang?.length ?? 0).replace(/^\n+/, '');

  if (rest.startsWith(header)) {
    return { fixed: compose(rest.slice(header.length).replace(/^\n+/, '')) };
  }
  if (NOTICE.test(leadingComments(rest))) {
    return { problem: 'carries a header that is not ours; fix by hand' };
  }
  return { fixed: compose(rest), problem: 'missing SPDX header' };
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const fix = process.argv.includes('--fix');
// Regular files only (mode 100644/100755): no symlinks, no submodules.
const files = execFileSync('git', ['ls-files', '--stage', '-z'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 1 << 28,
})
  .split('\0')
  .filter((entry) => /^100(?:644|755) /.test(entry))
  .map((entry) => entry.slice(entry.indexOf('\t') + 1))
  .filter((path) => !isExcluded(path));

const failures = [];
let fixedCount = 0;
for (const path of files) {
  const full = `${root}/${path}`;
  let text;
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  // Compare as LF so CRLF checkouts (core.autocrlf) pass; write back in kind.
  const crlf = text.includes('\r\n');
  const lf = crlf ? text.replace(/\r\n/g, '\n') : text;
  const { fixed, problem } = expected(path, lf);
  if (fixed === lf) continue;
  if (fix && fixed !== undefined) {
    writeFileSync(full, crlf ? fixed.replace(/\n/g, '\r\n') : fixed);
    fixedCount++;
  } else {
    failures.push(`${path}: ${problem ?? 'header spacing is off'}`);
  }
}

if (fix) console.log(`Fixed ${fixedCount} file(s).`);
for (const failure of failures) console.error(failure);
if (failures.length) {
  console.error(
    `${failures.length} file(s) without the expected SPDX header` +
      (fix ? '.' : '; run with --fix to repair.'),
  );
  process.exitCode = 1;
}
