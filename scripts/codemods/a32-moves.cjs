/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A32 codemod: infrastructure moves into data-handler's `src/infra/`; the two
 * pure helpers it uses from `modules/` move to `utils/`. No names change and
 * no re-exports stay at old paths.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run against the tree to transform (a git work tree):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a32-moves.cjs <target-root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules:
 *   move  `git mv` of the files in MOVES;
 *   path  over tools/{data-handler,backend,mcp,cli}/{src,test}, a relative
 *         import, re-export, `import()` or `vi.mock`-family specifier that
 *         names a moved file (or sits in one) is re-pointed;
 *   deep  a package subpath import (`@cyberismo/data-handler/utils/...`) of
 *         a moved file is merged into the root import, and data-handler's
 *         index.ts exports the names from the file's new path (`infra/` is
 *         not in the package's `exports` map).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Project: MorphProject, SyntaxKind } = require('ts-morph');

const rootArg = process.argv[2];
if (!rootArg) {
  console.error('usage: a32-moves.cjs <target-root>');
  process.exit(2);
}
const ROOT = path.resolve(rootArg);
const DH = path.join(ROOT, 'tools/data-handler');
const PKG = '@cyberismo/data-handler';
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const MOCKS = new Set([
  'vi.mock',
  'vi.doMock',
  'vi.unmock',
  'vi.doUnmock',
  'vi.importActual',
  'vi.importMock',
]);

const TREE = [
  'calculation-engine',
  'card-keys',
  'card-tree',
  'card-tree-scan',
  'cards-config',
  'project-content-watcher',
  'project-paths',
  'rank-plan',
  'resource-cache',
  'resource-handler',
  'resources-from',
];
const GIT = ['commit-context', 'git-config', 'git-manager', 'git-sync'];
const SOURCES = ['source', 'source-composite', 'source-file', 'source-git'];

// data-handler paths, old -> new.
const MOVES = [
  ['src/containers/project.ts', 'src/infra/checkout.ts'],
  ...TREE.map((f) => [`src/containers/project/${f}.ts`, `src/infra/${f}.ts`]),
  ['src/utils/rw-lock.ts', 'src/infra/rw-lock.ts'],
  ...GIT.map((f) => [`src/utils/${f}.ts`, `src/infra/${f}.ts`]),
  ['src/utils/change-feed.ts', 'src/infra/change-feed.ts'],
  ...SOURCES.map((f) => [
    `src/modules/${f}.ts`,
    `src/infra/module-source/${f}.ts`,
  ]),
  ['src/commands/fetch.ts', 'src/infra/hub-store.ts'],
  ['src/modules/version.ts', 'src/utils/version.ts'],
  ['src/modules/location.ts', 'src/utils/location.ts'],
].map(([from, to]) => [path.join(DH, from), path.join(DH, to)]);

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

// Moved files, new path -> old path.
const movedFrom = new Map(MOVES.map(([from, to]) => [to, from]));

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

const exists = (target) =>
  fs.existsSync(target.replace(/\.js$/, '.ts')) || fs.existsSync(target);

// The specifier to use from `file` for `spec`, or undefined if unchanged.
// A moved file's specifier that does not resolve from its new place is
// still relative to its old one.
function repoint(file, spec) {
  if (!spec.startsWith('.')) return undefined;
  const moves = new Map(MOVES);
  const here = path.resolve(path.dirname(file), spec);
  const stale = movedFrom.has(file) && !exists(here);
  const old = (
    stale ? path.resolve(path.dirname(movedFrom.get(file)), spec) : here
  ).replace(/\.js$/, '.ts');
  if (!moves.has(old) && !stale) return undefined;
  const next = relSpec(file, moves.get(old) ?? old);
  return next !== spec ? next : undefined;
}

function rewritePaths(sf) {
  const file = sf.getFilePath();
  for (const d of [
    ...sf.getImportDeclarations(),
    ...sf.getExportDeclarations(),
  ]) {
    const spec = d.getModuleSpecifierValue();
    const next = spec && repoint(file, spec);
    if (!next) continue;
    note(file, d.getStartLineNumber(), `path ${spec} -> ${next}`);
    d.setModuleSpecifier(next);
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const isImport = callee.getKind() === SyntaxKind.ImportKeyword;
    if (!isImport && !MOCKS.has(callee.getText())) continue;
    const [arg] = call.getArguments();
    if (
      !arg ||
      (arg.getKind() !== SyntaxKind.StringLiteral &&
        arg.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral)
    ) {
      continue;
    }
    const spec = arg.getLiteralValue();
    const next = repoint(file, spec);
    if (!next) continue;
    note(file, arg.getStartLineNumber(), `path ${spec} -> ${next}`);
    arg.setLiteralValue(next);
  }
}

// Root-index exports to add: new module path -> names.
const rootExports = new Map();

function rewriteDeep(sf) {
  const file = sf.getFilePath();
  const moves = new Map(MOVES);
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!spec.startsWith(PKG + '/')) continue;
    const target = path.join(DH, 'src', spec.slice(PKG.length + 1) + '.ts');
    if (!moves.has(target)) continue;
    if (imp.getDefaultImport() || imp.getNamespaceImport()) {
      throw new Error(`${file}: unsupported deep import ${spec}`);
    }
    const names = imp.getNamedImports().map((s) => ({
      name: s.getName(),
      alias: s.getAliasNode()?.getText(),
      isTypeOnly: imp.isTypeOnly() || s.isTypeOnly(),
    }));
    const modPath = relSpec(path.join(DH, 'src/index.ts'), moves.get(target));
    const set = rootExports.get(modPath) ?? new Set();
    names.forEach((n) => set.add(n.name));
    rootExports.set(modPath, set);
    note(file, imp.getStartLineNumber(), `deep ${spec} -> ${PKG}`);
    const root = sf
      .getImportDeclarations()
      .find((i) => i.getModuleSpecifierValue() === PKG && !i.isTypeOnly());
    if (root) {
      for (const n of names) {
        const existing = root.getNamedImports();
        const at = existing.findIndex(
          (s) =>
            s.isTypeOnly() || s.getName().toLowerCase() > n.name.toLowerCase(),
        );
        root.insertNamedImport(at < 0 ? existing.length : at, n);
      }
      imp.remove();
    } else {
      imp.setModuleSpecifier(PKG);
    }
  }
}

function addRootExports(mp) {
  const sf = mp.getSourceFileOrThrow(path.join(DH, 'src/index.ts'));
  for (const [modPath, names] of rootExports) {
    const have = sf
      .getExportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === modPath);
    const missing = [...names].filter(
      (n) => !have?.getNamedExports().some((s) => s.getName() === n),
    );
    if (missing.length === 0) continue;
    const d = sf.addExportDeclaration({
      moduleSpecifier: modPath,
      namedExports: missing,
    });
    note(sf.getFilePath(), d.getStartLineNumber(), `deep export ${missing}`);
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
  for (const sf of mp.getSourceFiles()) {
    rewritePaths(sf);
    rewriteDeep(sf);
  }
  addRootExports(mp);
  mp.saveSync();
  for (const e of edits) console.log(e);
  console.log(`${edits.length} sites`);
}

main();
