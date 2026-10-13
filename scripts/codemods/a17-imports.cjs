/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A17 codemod: the mutation envelope `MutationInput` and `ResourceName` move
 * to `@cyberismo/model`; the replay-log readers (seal-files, chain) and their
 * tests move from mutations/replay to infra/replay-log. No names change and
 * no re-exports stay at old paths.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run against the tree to transform (a git work tree):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a17-imports.cjs <target-root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules:
 *   move     `git mv` of the four replay-log files (MOVES);
 *   extract  the named declarations, with their leading comments, are cut
 *            verbatim into a new model file (EXTRACT), which the model
 *            barrel exports;
 *   reexport data-handler's root `export type { MutationInput }` goes;
 *   model    over tools/{data-handler,backend,mcp,cli}/{src,test}, an
 *            extracted name imported from its old module is imported from
 *            `@cyberismo/model` instead;
 *   path     a relative import or re-export of a moved file (or from a
 *            moved file) is re-pointed.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Project: MorphProject, SyntaxKind } = require('ts-morph');

const rootArg = process.argv[2];
if (!rootArg) {
  console.error('usage: a17-imports.cjs <target-root>');
  process.exit(2);
}
const ROOT = path.resolve(rootArg);
const DH = path.join(ROOT, 'tools/data-handler');
const MODEL = path.join(ROOT, 'tools/model/src');
const MODEL_PKG = '@cyberismo/model';
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];

// data-handler paths, old -> new.
const MOVES = [
  ['src/mutations/replay/seal-files.ts', 'src/infra/replay-log/seal-files.ts'],
  ['src/mutations/replay/chain.ts', 'src/infra/replay-log/chain.ts'],
  [
    'test/mutations/replay/seal-files.test.ts',
    'test/infra/replay-log/seal-files.test.ts',
  ],
  [
    'test/mutations/replay/chain.test.ts',
    'test/infra/replay-log/chain.test.ts',
  ],
].map(([from, to]) => [path.join(DH, from), path.join(DH, to)]);

// `from`: data-handler module; `to`: model module; `imports`: what the moved
// declarations name, as model-relative imports.
const EXTRACT = [
  {
    from: 'src/utils/resource-utils.ts',
    names: ['ResourceName'],
    to: 'interfaces/resource-name.ts',
    imports: [],
  },
  {
    from: 'src/mutations/types.ts',
    names: ['MutationInput'],
    to: 'interfaces/mutation-input.ts',
    imports: [
      ['Operation', './operations.js'],
      ['UpdateKey', './resource-interfaces.js'],
      ['ResourceName', './resource-name.js'],
    ],
  },
];

const HEADER = fs
  .readFileSync(path.join(MODEL, 'index.ts'), 'utf8')
  .match(/^\/\*\*[\s\S]*?\*\/\n/)[0];

const edits = [];
const note = (file, line, rule) =>
  edits.push(`${path.relative(ROOT, file)}:${line} ${rule}`);

function relSpec(fromFile, toFile) {
  let r = path
    .relative(path.dirname(fromFile), toFile)
    .split(path.sep)
    .join('/')
    .replace(/\.ts$/, '.js');
  if (!r.startsWith('.')) r = './' + r;
  return r;
}

// Start of a declaration with its own leading comments: a comment trailing
// the previous statement's line stays with that statement.
function startOf(full, d) {
  const pos = d.getPos();
  const m = /^[ \t]*\/\/[^\n]*\n/.exec(full.slice(pos));
  return m ? pos + m[0].length : pos;
}

// Cut [start, end) ranges out of a file's text, with a trailing newline.
function cutRanges(sf, ranges) {
  let text = sf.getFullText();
  for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) {
    const end = text[b] === '\n' ? b + 1 : b;
    text = text.slice(0, a) + text.slice(end);
  }
  sf.replaceWithText(text);
}

function moveFiles() {
  for (const [from, to] of MOVES) {
    if (!fs.existsSync(from)) {
      if (!fs.existsSync(to)) throw new Error(`missing ${from}`);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    execFileSync('git', ['-C', ROOT, 'mv', from, to]);
    note(from, 1, `move -> ${path.relative(ROOT, to)}`);
  }
}

function extract(mp) {
  for (const ex of EXTRACT) {
    const src = path.join(DH, ex.from);
    const dest = path.join(MODEL, ex.to);
    const sf = mp.getSourceFileOrThrow(src);
    const decls = ex.names
      .map((n) => sf.getTypeAlias(n) || sf.getInterface(n))
      .filter(Boolean);
    if (decls.length === 0) {
      if (!fs.existsSync(dest))
        throw new Error(`nothing to extract to ${dest}`);
      continue;
    }
    if (decls.length !== ex.names.length || fs.existsSync(dest)) {
      throw new Error(`${ex.from}: partly extracted`);
    }
    const used = new Set(
      decls.flatMap((d) =>
        d.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText()),
      ),
    );
    for (const imp of sf.getImportDeclarations()) {
      for (const s of imp.getNamedImports()) {
        const name = s.getName();
        if (used.has(name) && !ex.imports.some(([n]) => n === name)) {
          throw new Error(`${ex.from}: ${name} has no model import`);
        }
      }
    }
    const full = sf.getFullText();
    const bodies = decls.map((d) =>
      full.slice(startOf(full, d), d.getEnd()).replace(/^\s+/, ''),
    );
    const imports = ex.imports.map(
      ([n, spec]) => `import type { ${n} } from '${spec}';`,
    );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(
      dest,
      HEADER +
        '\n' +
        (imports.length ? imports.join('\n') + '\n\n' : '') +
        bodies.join('\n\n') +
        '\n',
    );
    note(dest, 1, `extract ${ex.names.join(', ')} from ${ex.from}`);
    let rest = full;
    for (const d of [...decls].sort((a, b) => b.getPos() - a.getPos())) {
      rest = rest.slice(0, startOf(full, d)) + rest.slice(d.getEnd());
    }
    sf.replaceWithText(rest);
    // Drop imports the module no longer uses.
    const left = new Set(
      sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((i) => !i.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
        .map((i) => i.getText()),
    );
    // Import back what the module still uses, then drop what it doesn't.
    const back = ex.names.filter((n) => left.has(n));
    if (back.length) {
      addModelImport(
        sf,
        sf.getImportDeclarations()[0].getChildIndex(),
        back.map((name) => ({ name, isTypeOnly: true })),
      );
    }
    const cut = [];
    for (const imp of sf.getImportDeclarations()) {
      const named = imp.getNamedImports();
      const drop = named.filter(
        (s) =>
          ex.imports.some(([n]) => n === s.getName()) && !left.has(s.getName()),
      );
      if (drop.length === 0) continue;
      if (drop.length === named.length && !imp.getDefaultImport()) {
        cut.push([imp.getStart(), imp.getEnd()]);
      } else {
        drop.forEach((s) => s.remove());
      }
    }
    if (cut.length) cutRanges(sf, cut);
  }
}

function barrel() {
  const file = path.join(MODEL, 'index.ts');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const ex of EXTRACT) {
    const line = `export * from './${ex.to.replace(/\.ts$/, '.js')}';`;
    if (lines.includes(line)) continue;
    const at = lines.findIndex(
      (l) => l.startsWith("export * from './") && l > line,
    );
    lines.splice(at, 0, line);
    note(file, at + 1, `barrel ${ex.to}`);
  }
  fs.writeFileSync(file, lines.join('\n'));
}

function dropRootReexport(mp) {
  const sf = mp.getSourceFileOrThrow(path.join(DH, 'src/index.ts'));
  for (const d of sf.getExportDeclarations()) {
    if (d.getModuleSpecifierValue() !== './mutations/types.js') continue;
    const names = d.getNamedExports().map((s) => s.getName());
    if (names.join() !== 'MutationInput') {
      throw new Error(`index.ts: unexpected export of ${names}`);
    }
    note(sf.getFilePath(), d.getStartLineNumber(), 'reexport');
    cutRanges(sf, [[d.getStart(), d.getEnd()]]);
    return;
  }
}

// Original path of a file that may have been moved.
function originalOf(file) {
  const m = MOVES.find(([, to]) => to === file);
  return m ? m[0] : file;
}

function resolveOld(file, spec) {
  return path
    .resolve(path.dirname(originalOf(file)), spec)
    .replace(/\.js$/, '.ts');
}

function addModelImport(sf, at, specs) {
  const existing = sf
    .getImportDeclarations()
    .find((i) => i.getModuleSpecifierValue() === MODEL_PKG);
  if (existing) {
    for (const s of specs) {
      existing.addNamedImport({
        ...s,
        isTypeOnly: s.isTypeOnly && !existing.isTypeOnly(),
      });
    }
    return;
  }
  const allType = specs.every((s) => s.isTypeOnly);
  sf.insertImportDeclaration(at, {
    moduleSpecifier: MODEL_PKG,
    isTypeOnly: allType,
    namedImports: specs.map((s) => ({ ...s, isTypeOnly: false })),
  });
}

function rewrite(mp) {
  const moves = new Map(MOVES);
  const from = new Map(
    EXTRACT.map((ex) => [path.join(DH, ex.from), new Set(ex.names)]),
  );
  for (const sf of mp.getSourceFiles()) {
    const file = sf.getFilePath();
    // path
    for (const d of [
      ...sf.getImportDeclarations(),
      ...sf.getExportDeclarations(),
    ]) {
      const spec = d.getModuleSpecifierValue();
      if (!spec || !spec.startsWith('.')) continue;
      const old = resolveOld(file, spec);
      if (!moves.has(old) && originalOf(file) === file) continue;
      const next = relSpec(file, moves.get(old) ?? old);
      if (next !== spec) {
        note(file, d.getStartLineNumber(), `path ${spec} -> ${next}`);
        d.setModuleSpecifier(next);
      }
    }
    // model
    const cut = [];
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (!spec.startsWith('.')) continue;
      const names = from.get(
        path.resolve(path.dirname(file), spec).replace(/\.js$/, '.ts'),
      );
      if (!names) continue;
      const named = imp.getNamedImports();
      const moving = named.filter((s) => names.has(s.getName()));
      if (moving.length === 0) continue;
      note(
        file,
        imp.getStartLineNumber(),
        `model ${moving.map((s) => s.getName())}`,
      );
      const specs = moving.map((s) => ({
        name: s.getName(),
        alias: s.getAliasNode()?.getText(),
        isTypeOnly: imp.isTypeOnly() || s.isTypeOnly(),
      }));
      const at = imp.getChildIndex();
      if (moving.length === named.length && !imp.getDefaultImport()) {
        cut.push([imp.getStart(), imp.getEnd()]);
      } else {
        moving.forEach((s) => s.remove());
      }
      addModelImport(sf, at, specs);
    }
    if (cut.length) {
      // Re-find the ranges: adding the model import shifted them.
      const ranges = sf
        .getImportDeclarations()
        .filter((imp) => {
          const spec = imp.getModuleSpecifierValue();
          if (!spec.startsWith('.')) return false;
          const names = from.get(
            path.resolve(path.dirname(file), spec).replace(/\.js$/, '.ts'),
          );
          return (
            names && imp.getNamedImports().every((s) => names.has(s.getName()))
          );
        })
        .map((imp) => [imp.getStart(), imp.getEnd()]);
      cutRanges(sf, ranges);
    }
  }
}

function main() {
  moveFiles();
  const mp = new MorphProject({ skipAddingFilesFromTsConfig: true });
  for (const pkg of PACKAGES) {
    for (const dir of ['src', 'test']) {
      mp.addSourceFilesAtPaths(path.join(ROOT, 'tools', pkg, dir, '**/*.ts'));
    }
  }
  extract(mp);
  dropRootReexport(mp);
  rewrite(mp);
  mp.saveSync();
  barrel();
  for (const e of edits) console.log(e);
  console.log(`${edits.length} sites`);
}

main();
