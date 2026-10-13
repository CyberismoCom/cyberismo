/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A2 model codemod: move the browser-safe shared types out of data-handler
 * (and the backend's project-errors) into a new `@cyberismo/model` package,
 * and point every import of them at it. No re-exports stay at old paths.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run against the tree to transform (it need not contain this script),
 * after the A1 codemod:
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a2-model.cjs <target-root>
 * Then format with the target's own prettier binary (`pnpm exec` would
 * install the new package and rewrite pnpm-lock.yaml):
 *   ./node_modules/.bin/prettier --write tools/
 * scripts/codemods/port-branch.sh does both.
 *
 * Pinned: ts-morph 28.0.0 (TypeScript 6.0.2).
 * Deterministic, and re-running on already converted code is a no-op.
 *
 * What it does:
 *   0. scaffold: writes tools/model (package.json, tsconfigs, eslint config,
 *      src/index.ts barrel) when absent; an existing file is left alone.
 *   1. moves (renames; the layout under src is kept, so relative imports
 *      between moved files hold): data-handler's types/queries,
 *      interfaces/{resource,folder-content,project}-interfaces,
 *      macros/common, macros/types, macros/<11>/{metadata,types}, and the
 *      backend's project-errors (29 files);
 *   2. extractions (named types cut out of Node-side modules, which import
 *      back what they still use): resource-object's operation types ->
 *      interfaces/operations, clean's Clean* -> interfaces/clean,
 *      modules/types' VersionSource -> interfaces/version-source,
 *      interfaces/macros' MacroMetadata and MacroName -> interfaces/macros;
 *   3. inside data-handler/src and backend/src, re-exports of moved modules
 *      and names are removed, including `export { X }` of a name now
 *      imported from the model;
 *   4. over tools/{data-handler,backend,mcp,cli}/{src,test} and
 *      tools/app/{src,__tests__}: an import of a whole-moved module goes to
 *      `@cyberismo/model`, or to `@cyberismo/model/<path>` when a name it
 *      imports is not the root's, or it has a default or namespace import;
 *      a name imported from a data-handler or backend module that no longer
 *      exports it but the model root does moves to a `@cyberismo/model`
 *      import;
 *   5. data-handler's `./interfaces/*` and `./types/*` subpath exports go
 *      away: an outside import of a module left there is pointed at the
 *      data-handler root, which gains an export of each name it lacked.
 *
 * Hand edits it does not make (the commit after the generated one):
 * package.json dependencies and data-handler's subpath exports, the app's
 * tsconfig and ESLint restriction, the Dockerfile, pnpm-lock.yaml, and two
 * app comments that name data-handler.
 *
 * Type resolution: the rules read export tables of the tree's own sources
 * only (workspace packages are mapped to source), never node_modules, so an
 * uninstalled tree transforms the same. The script refuses when a module a
 * rule reads is missing (an empty export table would read as "everything
 * moved"), when an import into data-handler, the backend or the model
 * doesn't resolve afterwards, and when the app still imports data-handler.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const rootArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!rootArg) {
  console.error('usage: a2-model.cjs <target-root>');
  process.exit(2);
}
const ROOT = path.resolve(rootArg);
const DH = path.join(ROOT, 'tools/data-handler/src');
const BE = path.join(ROOT, 'tools/backend/src');
const APP = path.join(ROOT, 'tools/app');
const MODEL_DIR = path.join(ROOT, 'tools/model');
const MODEL = path.join(MODEL_DIR, 'src');
const MODEL_PKG = '@cyberismo/model';
const DH_PKG = '@cyberismo/data-handler';
const BE_PKG = '@cyberismo/backend';

const MACROS = [
  'createCards',
  'graph',
  'image',
  'include',
  'mermaid',
  'percentage',
  'report',
  'scoreCard',
  'vega',
  'vegalite',
  'xref',
];

// Packages types move out of. `whole`: module paths (relative to src, no
// extension) that move whole to the same path under model/src.
const DH_SRC = {
  pkg: DH_PKG,
  dir: DH,
  whole: new Set([
    'types/queries',
    'interfaces/resource-interfaces',
    'interfaces/folder-content-interfaces',
    'interfaces/project-interfaces',
    'macros/common',
    'macros/types',
    ...MACROS.flatMap((m) => [`macros/${m}/metadata`, `macros/${m}/types`]),
  ]),
};
const BE_SRC = { pkg: BE_PKG, dir: BE, whole: new Set(['project-errors']) };
const SOURCES = [DH_SRC, BE_SRC];
// data-handler subpath exports that go away.
const DROPPED_SUBPATHS = ['interfaces/', 'types/'];

const PACKAGES = [
  { dir: 'data-handler', globs: ['src/**/*.ts', 'test/**/*.ts'] },
  { dir: 'backend', globs: ['src/**/*.ts', 'test/**/*.ts'] },
  { dir: 'mcp', globs: ['src/**/*.ts', 'test/**/*.ts'] },
  { dir: 'cli', globs: ['src/**/*.ts', 'test/**/*.ts'] },
  {
    dir: 'app',
    globs: [
      'src/**/*.ts',
      'src/**/*.tsx',
      '__tests__/**/*.ts',
      '__tests__/**/*.tsx',
    ],
  },
];

const HEADER = `/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
`;

// ---------------------------------------------------------------- scaffold

// tsconfig.json: no Node or DOM types, so an import of a Node built-in
// fails to compile; skipLibCheck because vega's typings reference
// HTMLElement; no isolatedModules, as macros/types.ts re-exports types
// without `type`.
const SCAFFOLD = {
  'package.json': `{
  "name": "@cyberismo/model",
  "version": "1.1.2",
  "description": "Browser-safe shared types for Cyberismo",
  "author": "sami.merila@cyberismo.com",
  "license": "AGPL-3.0",
  "homepage": "https://github.com/CyberismoCom/cyberismo",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/CyberismoCom/cyberismo.git"
  },
  "bugs": "https://github.com/CyberismoCom/cyberismo/issues",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "clean": "rm -rf node_modules",
    "lint": "eslint .",
    "dev": "tsc --watch --preserveWatchOutput -p tsconfig.build.json"
  },
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./macros/*": {
      "types": "./dist/macros/*.d.ts",
      "default": "./dist/macros/*.js"
    },
    "./types/*": {
      "types": "./dist/types/*.d.ts",
      "default": "./dist/types/*.js"
    }
  },
  "dependencies": {
    "ajv": "^8.20.0",
    "vega": "^6.4.0",
    "vega-lite": "^6.4.2"
  },
  "files": [
    "dist",
    "src"
  ]
}
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "strict": true,
    "alwaysStrict": true,
    "sourceMap": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": [],
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
`,
  'tsconfig.build.json': `{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "incremental": true,
    "tsBuildInfoFile": "./tsconfig.build.tsbuildinfo",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "extends": "./tsconfig.json",
  "include": ["src/**/*"]
}
`,
  'eslint.config.js': `import { nodeConfig } from '../../eslint.config.js';

export default [
  ...nodeConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
`,
  'src/index.ts':
    HEADER +
    `
// Browser-safe shared types. Nothing here may import Node built-ins.
export * from './interfaces/clean.js';
export * from './interfaces/folder-content-interfaces.js';
export * from './interfaces/macros.js';
export * from './interfaces/operations.js';
export * from './interfaces/project-interfaces.js';
export * from './interfaces/resource-interfaces.js';
export * from './interfaces/version-source.js';
export * from './macros/common.js';
export * from './macros/types.js';
export * from './project-errors.js';
export * from './types/queries.js';

// resource-interfaces and queries both declare EnumDefinition. The root
// exports the field-type one; the query result's is under './types/queries'.
export type { EnumDefinition } from './interfaces/resource-interfaces.js';
`,
};

function writeScaffold() {
  let n = 0;
  for (const [rel, text] of Object.entries(SCAFFOLD)) {
    const file = path.join(MODEL_DIR, rel);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- moves

// Named types cut out of Node-side data-handler modules into model files.
const EXTRACT = [
  {
    from: 'resources/resource-object',
    to: 'interfaces/operations',
    names: [
      'UpdateOperations',
      'BaseOperation',
      'AddOperation',
      'ChangeOperation',
      'RankOperation',
      'RemoveOperation',
      'Operation',
      'OperationMap',
      'OperationFor',
    ],
  },
  {
    from: 'commands/clean',
    to: 'interfaces/clean',
    names: ['CleanReason', 'CleanFinding', 'CleanResult'],
  },
  {
    from: 'modules/types',
    to: 'interfaces/version-source',
    names: ['VersionSource'],
  },
  {
    from: 'interfaces/macros',
    to: 'interfaces/macros',
    names: ['MacroMetadata', 'MacroName'],
  },
];

// Whole-file moves: <src>/<rel>.ts -> model/src/<rel>.ts.
function moveWhole() {
  let n = 0;
  for (const src of SOURCES) {
    for (const rel of [...src.whole].sort()) {
      const from = path.join(src.dir, rel + '.ts');
      const to = path.join(MODEL, rel + '.ts');
      if (!fs.existsSync(from)) {
        if (!fs.existsSync(to)) throw new Error(`missing ${rel}.ts`);
        continue;
      }
      if (fs.existsSync(to)) throw new Error(`both sides have ${rel}.ts`);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      n++;
    }
  }
  return n;
}

function relSpec(fromFile, toFile) {
  let r = path
    .relative(path.dirname(fromFile), toFile)
    .split(path.sep)
    .join('/')
    .replace(/\.ts$/, '.js');
  if (!r.startsWith('.')) r = './' + r;
  return r;
}

function identifiersIn(nodes) {
  const ids = new Set();
  for (const n of nodes) {
    for (const id of n.getDescendantsOfKind(SyntaxKind.Identifier)) {
      ids.add(id.getText());
    }
  }
  return ids;
}

function extractTypes() {
  const mp = new MorphProject({ skipAddingFilesFromTsConfig: true });
  let n = 0;
  for (const ex of EXTRACT) {
    const src = path.join(DH, ex.from + '.ts');
    const dest = path.join(MODEL, ex.to + '.ts');
    const sf = mp.addSourceFileAtPath(src);
    const decls = ex.names
      .map((name) => sf.getTypeAlias(name) || sf.getInterface(name))
      .filter(Boolean)
      .sort((a, b) => a.getPos() - b.getPos());
    if (decls.length === 0) {
      if (!fs.existsSync(dest)) {
        throw new Error(`nothing to extract to ${ex.to}`);
      }
      continue;
    }
    if (decls.length !== ex.names.length) {
      throw new Error(`${ex.from}: partly extracted`);
    }
    if (fs.existsSync(dest)) throw new Error(`${ex.to} exists`);
    const full = sf.getFullText();
    const bodies = decls.map((d) =>
      full.slice(d.getPos(), d.getEnd()).replace(/^\s+/, ''),
    );
    const used = identifiersIn(decls);
    // A local the bodies name must move with them.
    const locals = [
      ...sf.getTypeAliases(),
      ...sf.getInterfaces(),
      ...sf.getEnums(),
      ...sf.getClasses(),
      ...sf.getFunctions(),
      ...sf.getVariableDeclarations(),
    ].map((d) => d.getName());
    for (const name of locals) {
      if (used.has(name) && !ex.names.includes(name)) {
        throw new Error(
          `${ex.from}: extracted types use local ${name}; add it to names`,
        );
      }
    }
    // Imports the extracted types need, re-pointed from the new file.
    const imports = [];
    const pruned = [];
    for (const imp of sf.getImportDeclarations()) {
      const names = imp
        .getNamedImports()
        .map((s) => (s.getAliasNode() || s.getNameNode()).getText())
        .filter((local) => used.has(local));
      if (names.length === 0) continue;
      const spec = imp.getModuleSpecifierValue();
      if (!spec.startsWith('.')) {
        throw new Error(`${ex.from}: extracted types use package ${spec}`);
      }
      const rel = path
        .relative(DH, path.resolve(path.dirname(src), spec))
        .split(path.sep)
        .join('/')
        .replace(/\.js$/, '');
      if (!DH_SRC.whole.has(rel)) {
        throw new Error(`${ex.from}: extracted types use unmoved ${rel}`);
      }
      imports.push(
        `import type { ${names.join(', ')} } from '${relSpec(
          dest,
          path.join(MODEL, rel + '.ts'),
        )}';`,
      );
      pruned.push(...names);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(
      dest,
      HEADER +
        '\n' +
        (imports.length ? imports.join('\n') + '\n\n' : '') +
        bodies.join('\n\n') +
        '\n',
    );
    // Declarations go by text with their leading comments (remove() keeps
    // `//` comments behind and eats the blank line after the imports).
    let rest = full;
    for (const d of [...decls].reverse()) {
      if (d.getChildIndex() === 0) {
        throw new Error(`${ex.from}: ${d.getName()} is the first statement`);
      }
      rest = rest.slice(0, d.getPos()) + rest.slice(d.getEnd());
    }
    sf.replaceWithText(rest);
    // Back-import what the module still uses; drop imports only the
    // extracted types used.
    const left = new Set(
      sf
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter(
          (id) => !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
        )
        .map((id) => id.getText()),
    );
    // Whole imports go by text: remove() would take the file's leading
    // comment (the licence header) with the first statement.
    const cut = [];
    for (const imp of sf.getImportDeclarations()) {
      const named = imp.getNamedImports();
      const drop = named.filter((s) => {
        const local = (s.getAliasNode() || s.getNameNode()).getText();
        return pruned.includes(local) && !left.has(local);
      });
      if (drop.length === 0) continue;
      if (
        drop.length === named.length &&
        !imp.getDefaultImport() &&
        !imp.getNamespaceImport()
      ) {
        cut.push([imp.getStart(), imp.getEnd()]);
      } else {
        drop.forEach((s) => s.remove());
      }
    }
    if (cut.length) {
      let text = sf.getFullText();
      for (const [a, b] of cut.sort((x, y) => y[0] - x[0])) {
        const end = text[b] === '\n' ? b + 1 : b;
        text = text.slice(0, a) + text.slice(end);
      }
      sf.replaceWithText(text);
    }
    const back = ex.names.filter((name) => left.has(name));
    if (back.length) {
      const all = sf.getImportDeclarations();
      sf.insertImportDeclaration(all.length, {
        moduleSpecifier: MODEL_PKG,
        isTypeOnly: true,
        namedImports: back,
      });
    }
    n++;
  }
  mp.saveSync();
  return n;
}

// In moved files, a relative import of a data-handler module whose names
// were all extracted goes to the model file that now holds them.
function repointMovedImports() {
  const mp = new MorphProject({ skipAddingFilesFromTsConfig: true });
  const files = SOURCES.flatMap((s) => [...s.whole])
    .sort()
    .map((rel) => path.join(MODEL, rel + '.ts'));
  let n = 0;
  for (const file of files) {
    const sf = mp.addSourceFileAtPath(file);
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (!spec.startsWith('.')) continue;
      const abs = path
        .resolve(path.dirname(file), spec)
        .replace(/\.js$/, '.ts');
      if (fs.existsSync(abs)) continue;
      const rel = path
        .relative(MODEL, abs)
        .split(path.sep)
        .join('/')
        .replace(/\.ts$/, '');
      const names = imp.getNamedImports().map((s) => s.getName());
      const ex = EXTRACT.find(
        (e) => e.from === rel && names.every((x) => e.names.includes(x)),
      );
      if (!ex || imp.getDefaultImport() || imp.getNamespaceImport()) {
        throw new Error(`${path.relative(ROOT, file)}: unmoved import ${spec}`);
      }
      imp.setModuleSpecifier(relSpec(file, path.join(MODEL, ex.to + '.ts')));
      n++;
    }
  }
  mp.saveSync();
  return n;
}

function phaseMoves() {
  const scaffold = writeScaffold();
  const moved = moveWhole();
  const extracted = extractTypes();
  const repointed = repointMovedImports();
  console.log(
    `moves: ${scaffold} scaffold files written, ${moved} files moved, ` +
      `${extracted} extractions, ${repointed} moved-file imports re-pointed`,
  );
}

// ---------------------------------------------------------------- imports

function loadProject() {
  const mp = new MorphProject({
    compilerOptions: {
      strict: true,
      allowJs: false,
      module: 199 /* NodeNext */,
      moduleResolution: 99 /* NodeNext */,
      resolveJsonModule: true,
      esModuleInterop: true,
      target: 10 /* ES2023 */,
      jsx: 4 /* ReactJSX */,
      lib: ['lib.es2023.d.ts'],
      types: ['node'],
      baseUrl: ROOT,
      paths: {
        [DH_PKG]: ['tools/data-handler/src/index.ts'],
        [`${DH_PKG}/*`]: ['tools/data-handler/src/*'],
        [BE_PKG]: ['tools/backend/src/index.ts'],
        [MODEL_PKG]: ['tools/model/src/index.ts'],
        [`${MODEL_PKG}/*`]: ['tools/model/src/*'],
      },
    },
    skipAddingFilesFromTsConfig: true,
  });
  for (const pkg of PACKAGES) {
    const base = path.join(ROOT, 'tools', pkg.dir);
    mp.addSourceFilesAtPaths([
      ...pkg.globs.map((g) => path.join(base, g)),
      '!' + path.join(base, 'test/**/tmp-*/**'),
      '!**/node_modules/**',
    ]);
  }
  mp.addSourceFilesAtPaths(path.join(MODEL, '**/*.ts'));
  return mp;
}

function isUnder(dir, file) {
  const r = path.relative(dir, file);
  return !r.startsWith('..') && !path.isAbsolute(r);
}

// The source-package module a specifier names, as { src, rel, subpath }:
// rel relative to src without extension ('index' for the package root);
// subpath when named through the package, not relatively. Else undefined.
function srcModule(sf, spec) {
  for (const src of SOURCES) {
    if (spec === src.pkg) return { src, rel: 'index', subpath: false };
    if (spec.startsWith(src.pkg + '/')) {
      const rel = spec.slice(src.pkg.length + 1).replace(/\.js$/, '');
      return { src, rel, subpath: true };
    }
  }
  if (!spec.startsWith('.')) return undefined;
  const abs = path.resolve(path.dirname(sf.getFilePath()), spec);
  for (const src of SOURCES) {
    if (!isUnder(src.dir, abs)) continue;
    const rel = path
      .relative(src.dir, abs)
      .split(path.sep)
      .join('/')
      .replace(/\.(js|ts)$/, '');
    return { src, rel, subpath: false };
  }
  return undefined;
}

function isWhole(m) {
  return m.src.whole.has(m.rel);
}

function inSrc(sf, srcs) {
  return srcs.some((s) => isUnder(s.dir, sf.getFilePath()));
}

function modelFile(rel) {
  return path.join(MODEL, rel + '.ts');
}

function moduleFile(mp, m) {
  for (const f of [m.rel + '.ts', m.rel + '/index.ts']) {
    const file = path.join(m.src.dir, f);
    if (mp.getSourceFile(file)) return file;
  }
  return path.join(m.src.dir, m.rel + '.ts');
}

// Export tables stay fixed within a pass; reset between passes.
let exportCache;

function exportsOf(mp, file) {
  if (exportCache && exportCache.has(file)) return exportCache.get(file);
  const sf = mp.getSourceFile(file);
  // An empty table would read as "everything moved".
  if (!sf) throw new Error(`unresolved module ${path.relative(ROOT, file)}`);
  const exported = sf.getExportedDeclarations();
  if (exportCache) exportCache.set(file, exported);
  return exported;
}

function where(node) {
  return (
    path.relative(ROOT, node.getSourceFile().getFilePath()) +
    ':' +
    node.getStartLineNumber()
  );
}

const stats = {
  retargeted: 0,
  subpath: 0,
  moved: 0,
  reexports: 0,
  localReexports: 0,
  rooted: 0,
  rootExports: 0,
};
const subpaths = new Set();

// A name that module `m` no longer exports, but the model root does.
function movedName(mp, m, name) {
  if (isWhole(m)) return false;
  if (exportsOf(mp, moduleFile(mp, m)).has(name)) return false;
  return exportsOf(mp, modelFile('index')).has(name);
}

// Phase 3: re-exports inside data-handler/src and backend/src.
function dropReexports(mp) {
  for (const sf of mp.getSourceFiles()) {
    if (!inSrc(sf, SOURCES)) continue;
    const gone = [];
    for (const d of sf.getExportDeclarations()) {
      const spec = d.getModuleSpecifierValue();
      const m = spec && srcModule(sf, spec);
      if (!m) continue;
      if (isWhole(m)) {
        console.log(`removed re-export ${where(d)}`);
        gone.push(d);
        stats.reexports++;
        continue;
      }
      for (const s of d.getNamedExports()) {
        if (!movedName(mp, m, s.getName())) continue;
        console.log(`removed re-export of ${s.getName()} ${where(s)}`);
        s.remove();
        stats.reexports++;
      }
      if (!d.isNamespaceExport() && d.getNamedExports().length === 0) {
        gone.push(d);
      }
    }
    if (gone.length) removeStatements(sf, gone);
  }
}

// Whether every name `decl` imports (or re-exports) from model module `rel`
// is the root's.
function rootServes(mp, rel, decl) {
  let named;
  if (Node.isImportDeclaration(decl)) {
    if (decl.getDefaultImport() || decl.getNamespaceImport()) return false;
    named = decl.getNamedImports();
  } else {
    if (decl.isNamespaceExport()) return false;
    named = decl.getNamedExports();
  }
  if (named.length === 0) return false;
  const mod = exportsOf(mp, modelFile(rel));
  const root = exportsOf(mp, modelFile('index'));
  return named.every((s) => {
    const own = mod.get(s.getName());
    const viaRoot = root.get(s.getName());
    return own && viaRoot && own.some((n) => viaRoot.includes(n));
  });
}

function specsOf(moving, typeOnly) {
  return moving.map((s) => ({
    name: s.getName(),
    alias: s.getAliasNode() ? s.getAliasNode().getText() : undefined,
    isTypeOnly: !typeOnly && s.isTypeOnly(),
  }));
}

// Phase 4: imports (and, outside the source packages' src, export-from).
function rewriteImports(mp, only) {
  for (const sf of mp.getSourceFiles()) {
    if (!only(sf)) continue;
    if (isUnder(MODEL, sf.getFilePath())) continue;
    const decls = [
      ...sf.getImportDeclarations(),
      ...(inSrc(sf, SOURCES) ? [] : sf.getExportDeclarations()),
    ];
    const split = [];
    for (const d of decls) {
      const spec = d.getModuleSpecifierValue();
      const m = spec && srcModule(sf, spec);
      if (!m) continue;
      const isImport = Node.isImportDeclaration(d);
      if (isWhole(m)) {
        const toRoot = rootServes(mp, m.rel, d);
        const target = toRoot ? MODEL_PKG : `${MODEL_PKG}/${m.rel}`;
        d.setModuleSpecifier(target);
        stats.retargeted++;
        if (!toRoot) {
          stats.subpath++;
          subpaths.add(m.rel);
          console.log(`subpath ${target} ${where(d)}`);
        }
        continue;
      }
      if (!isImport) {
        moveReexports(sf, mp, m, d);
        continue;
      }
      const moving = d
        .getNamedImports()
        .filter((s) => movedName(mp, m, s.getName()));
      if (moving.length === 0) continue;
      const typeOnly = d.isTypeOnly();
      const specs = specsOf(moving, typeOnly);
      stats.moved += moving.length;
      const all =
        moving.length === d.getNamedImports().length &&
        !d.getDefaultImport() &&
        !d.getNamespaceImport();
      if (all) {
        d.setModuleSpecifier(MODEL_PKG);
      } else {
        moving.forEach((s) => s.remove());
        split.push([d, typeOnly, specs]);
      }
    }
    if (split.length) insertModelImports(sf, split);
    mergeModelImports(sf);
  }
}

// Each [decl, typeOnly, specs]: a model import on the line after decl. By
// text: insertImportDeclaration() drops the blank line after the imports.
function insertModelImports(sf, split) {
  const at = split
    .map(([d, typeOnly, specs]) => {
      const names = specs
        .map(
          (s) =>
            (s.isTypeOnly ? 'type ' : '') +
            s.name +
            (s.alias ? ` as ${s.alias}` : ''),
        )
        .join(', ');
      const type = typeOnly ? 'type ' : '';
      return [d.getEnd(), `\nimport ${type}{ ${names} } from '${MODEL_PKG}';`];
    })
    .sort((x, y) => y[0] - x[0]);
  let text = sf.getFullText();
  for (const [pos, line] of at)
    text = text.slice(0, pos) + line + text.slice(pos);
  sf.replaceWithText(text);
}

// `export { X } from '<source package>'` outside it, for a name that moved:
// re-export it from the model instead.
function moveReexports(sf, mp, m, d) {
  const moving = d
    .getNamedExports()
    .filter((s) => movedName(mp, m, s.getName()));
  if (moving.length === 0) return;
  stats.moved += moving.length;
  if (moving.length === d.getNamedExports().length) {
    d.setModuleSpecifier(MODEL_PKG);
    return;
  }
  const typeOnly = d.isTypeOnly();
  const specs = specsOf(moving, typeOnly);
  const index = d.getChildIndex() + 1;
  moving.forEach((s) => s.remove());
  sf.insertExportDeclaration(index, {
    moduleSpecifier: MODEL_PKG,
    isTypeOnly: typeOnly,
    namedExports: specs,
  });
}

// One `import` and one `import type` from the model per file.
function mergeModelImports(sf) {
  for (const typeOnly of [true, false]) {
    const same = sf
      .getImportDeclarations()
      .filter(
        (d) =>
          d.getModuleSpecifierValue() === MODEL_PKG &&
          d.isTypeOnly() === typeOnly &&
          !d.getDefaultImport() &&
          !d.getNamespaceImport(),
      );
    if (same.length < 2) continue;
    const [first, ...rest] = same;
    const have = new Set(first.getNamedImports().map((s) => s.getText()));
    for (const d of rest) {
      for (const s of d.getNamedImports()) {
        if (have.has(s.getText())) continue;
        have.add(s.getText());
        first.addNamedImport({
          name: s.getName(),
          alias: s.getAliasNode() ? s.getAliasNode().getText() : undefined,
          isTypeOnly: s.isTypeOnly(),
        });
      }
    }
    removeStatements(sf, rest);
  }
}

// Removes whole statements by text, each with its line break; remove()
// also eats the blank line after the last import.
function removeStatements(sf, nodes) {
  let text = sf.getFullText();
  const cuts = nodes
    .map((n) => [n.getStart(), n.getEnd()])
    .sort((x, y) => y[0] - x[0]);
  for (const [a, b] of cuts) {
    text = text.slice(0, a) + text.slice(text[b] === '\n' ? b + 1 : b);
  }
  sf.replaceWithText(text);
}

// Phase 3, second half: `export { X }` in data-handler/src of a name now
// imported from the model; the import goes too when nothing else uses it.
function dropLocalReexports(mp) {
  for (const sf of mp.getSourceFiles()) {
    if (!inSrc(sf, [DH_SRC])) continue;
    const fromModel = new Map();
    for (const d of sf.getImportDeclarations()) {
      if (!d.getModuleSpecifierValue().startsWith(MODEL_PKG)) continue;
      for (const s of d.getNamedImports()) {
        const local = s.getAliasNode()
          ? s.getAliasNode().getText()
          : s.getName();
        fromModel.set(local, s);
      }
    }
    for (const d of sf.getExportDeclarations()) {
      if (d.getModuleSpecifier()) continue;
      for (const s of d.getNamedExports()) {
        const name = s.getName();
        const imp = fromModel.get(name);
        if (!imp) continue;
        console.log(`removed local re-export of ${name} ${where(s)}`);
        s.remove();
        stats.localReexports++;
        const uses = sf
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .filter(
            (id) =>
              id.getText() === name &&
              !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
          );
        if (uses.length === 0) {
          const decl = imp.getImportDeclaration();
          imp.remove();
          if (
            decl.getNamedImports().length === 0 &&
            !decl.getDefaultImport() &&
            !decl.getNamespaceImport()
          ) {
            decl.remove();
          }
        }
      }
      if (d.getNamedExports().length === 0) d.remove();
    }
  }
}

// Phase 5: an import outside data-handler of a module left under a dropped
// subpath export goes to the data-handler root, which exports what it
// lacked from that module (after the declaration that already names the
// module, else after the last export-from).
function rootDroppedSubpaths(mp) {
  const index = mp.getSourceFileOrThrow(path.join(DH, 'index.ts'));
  for (const sf of mp.getSourceFiles()) {
    if (inSrc(sf, [DH_SRC]) || isUnder(MODEL, sf.getFilePath())) continue;
    for (const d of sf.getImportDeclarations()) {
      const m = srcModule(sf, d.getModuleSpecifierValue());
      if (!m || m.src !== DH_SRC || !m.subpath || isWhole(m)) continue;
      if (!DROPPED_SUBPATHS.some((p) => m.rel.startsWith(p))) continue;
      if (d.getDefaultImport() || d.getNamespaceImport()) {
        throw new Error(`${where(d)}: cannot root ${d.getText()}`);
      }
      const file = moduleFile(mp, m);
      const own = exportsOf(mp, file);
      const local = relSpec(index.getFilePath(), file);
      for (const s of d.getNamedImports()) {
        if (index.getExportedDeclarations().has(s.getName())) continue;
        if (!own.has(s.getName())) {
          throw new Error(`${where(d)}: ${m.rel} lacks ${s.getName()}`);
        }
        const named = [
          ...index.getImportDeclarations(),
          ...index.getExportDeclarations(),
        ].filter((x) => x.getModuleSpecifierValue() === local);
        const anchor = named.length
          ? named[named.length - 1]
          : index
              .getExportDeclarations()
              .filter((x) => x.getModuleSpecifier())
              .pop();
        // By text: insertExportDeclaration() opens a blank line after an
        // import.
        const type = d.isTypeOnly() || s.isTypeOnly() ? 'type ' : '';
        index.insertText(
          anchor.getEnd(),
          `\nexport ${type}{ ${s.getName()} } from '${local}';`,
        );
        console.log(`root export of ${s.getName()} for ${where(d)}`);
        stats.rootExports++;
      }
      d.setModuleSpecifier(DH_PKG);
      stats.rooted++;
    }
  }
}

// After the rewrite: the app imports nothing from data-handler or the
// backend, and every import into them or the model resolves.
function check(mp) {
  const bad = [];
  for (const sf of mp.getSourceFiles()) {
    const inApp = isUnder(APP, sf.getFilePath());
    for (const d of [
      ...sf.getImportDeclarations(),
      ...sf.getExportDeclarations(),
    ]) {
      const spec = d.getModuleSpecifierValue();
      if (!spec) continue;
      const m = srcModule(sf, spec);
      if (m && inApp) {
        bad.push(`  ${where(d)}: app imports ${spec}`);
        continue;
      }
      const model =
        spec === MODEL_PKG ||
        spec.startsWith(MODEL_PKG + '/') ||
        (spec.startsWith('.') && isUnder(MODEL, sf.getFilePath()));
      if (!m && !model) continue;
      if (!d.getModuleSpecifierSourceFile()) {
        bad.push(`  ${where(d)}: unresolved ${spec}`);
      }
    }
  }
  if (bad.length) {
    throw new Error(
      `${bad.length} bad imports in ${ROOT}:\n` +
        bad.slice(0, 20).join('\n') +
        (bad.length > 20 ? '\n  ...' : ''),
    );
  }
}

function main() {
  phaseMoves();
  const mp = loadProject();
  dropReexports(mp);
  // data-handler first: its root re-exports names it imports, and only
  // once those imports point at the model can the local re-exports go.
  exportCache = new Map();
  rewriteImports(mp, (sf) => inSrc(sf, [DH_SRC]));
  exportCache = undefined;
  dropLocalReexports(mp);
  exportCache = new Map();
  rewriteImports(mp, (sf) => !inSrc(sf, [DH_SRC]));
  exportCache = undefined;
  rootDroppedSubpaths(mp);
  check(mp);
  const changed = mp.getSourceFiles().filter((sf) => !sf.isSaved());
  mp.saveSync();
  console.log(
    `${changed.length} files; ${stats.retargeted} imports retargeted ` +
      `(${stats.subpath} to a subpath), ${stats.moved} names moved, ` +
      `${stats.reexports} re-exports and ${stats.localReexports} local ` +
      `re-exports removed, ${stats.rooted} imports rooted ` +
      `(${stats.rootExports} root exports added)`,
  );
  if (subpaths.size) {
    console.log(`subpaths used: ${[...subpaths].sort().join(', ')}`);
  }
}

main();
