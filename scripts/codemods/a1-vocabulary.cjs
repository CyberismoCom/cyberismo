/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A1 vocabulary codemod: infra `Project` -> `Checkout`,
 * `CommandManager` -> `Workspace`, and the identifiers typed by them.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run against the tree to transform (it need not contain this script):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a1-vocabulary.cjs <target-root> [--phase=types|identifiers|all] [--report]
 *
 * Then format the tree (scripts/codemods/port-branch.sh does both):
 *   pnpm prettier-fix
 *
 * Pinned: ts-morph 28.0.0 (bundles @ts-morph/common 0.29.0, TypeScript
 * 6.0.2).
 * Deterministic, and re-running on already converted code is a no-op.
 *
 * What it does, over tools/{data-handler,backend,mcp,cli}/{src,test}, with
 * `@cyberismo/data-handler` resolved to source so renames cross packages:
 *   1. types: `Project` -> `Checkout`, `ProjectOptions` -> `CheckoutOptions`
 *      (file stays at containers/project.ts); `command-manager.ts` moves to
 *      `workspace/workspace.ts`, `CommandManager` -> `Workspace`,
 *      `CommandManagerOptions` -> `WorkspaceOptions`.
 *   2. identifiers: declarations typed `Checkout` named `project` ->
 *      `checkout`; typed `Workspace` named `commands`/`commandManager` ->
 *      `ws`; their JSDoc `@param` tags with them. Compound names and keys
 *      typed from elsewhere (e.g. log bindings) are left alone.
 *      `{ checkout: checkout }` is folded back to `{ checkout }`.
 *   3. Hono: `ContextVariableMap.commands` -> `ws` and the string keys of
 *      `c.get('commands')` / `c.set('commands', ...)` on a Hono `Context`.
 *   4. keys the type checker can't see:
 *      - utils/rw-lock.ts `getLock`: the `project` string key, its error
 *        text and comment -> `checkout`;
 *      - data-handler/test/rw-lock.test.ts: fake fields
 *        `project = { lock }` -> `checkout`;
 *      - object literals cast `as unknown as Workspace`: `project:` key ->
 *        `checkout:` (backend export, middleware/commandManager and
 *        project-registry-replace tests on the A1 base).
 *
 * Hand edits it does not make: none.
 *
 * Type resolution: renames follow types, so a tree whose modules don't
 * resolve (no node_modules) would get a partial, valid-looking rename. The
 * script refuses to run when the target packages report an unresolved
 * module or type definition, other than unbuilt `@cyberismo/*` workspace
 * packages outside the `paths` map (nothing to rename there), and when
 * `ContextVariableMap.commands` exists but no Hono key was renamed.
 *
 * Compiler options are hard-coded, not read from each package's
 * tsconfig.json: one program spans the four packages and takes one option
 * set. The package tsconfigs agree on what matters here (strict, NodeNext,
 * es2023); they differ only in allowJs/sourceMap/outDir and cli's missing
 * `types`, which don't change how the .ts sources resolve. Drift that does
 * break resolution is caught by the check above.
 *
 * Known limits (tsc and the test suite catch what slips through):
 *   - renames don't check for name collisions; `ws` is a common WebSocket
 *     identifier, so a scope holding both is renamed into a clash;
 *   - the mock rule matches the literal type text `as unknown as Workspace`;
 *     casts via `as never` or an aliased import keep their `project:` key.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const args = process.argv.slice(2);
const rootArg = args.find((a) => !a.startsWith('--'));
if (!rootArg) {
  console.error(
    'usage: a1-vocabulary.cjs <target-root> [--phase=...] [--report]',
  );
  process.exit(2);
}
const ROOT = path.resolve(rootArg);
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const DH = path.join(ROOT, 'tools/data-handler/src');

const phaseArg = (
  args.find((a) => a.startsWith('--phase=')) || '--phase=all'
).split('=')[1];
const REPORT = args.includes('--report');

const CHECKOUT_FILE = path.join(DH, 'containers/project.ts');
const OLD_WS_FILE = path.join(DH, 'command-manager.ts');
const NEW_WS_FILE = path.join(DH, 'workspace/workspace.ts');

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
      lib: ['lib.es2023.d.ts'],
      types: ['node'],
      experimentalDecorators: false,
      baseUrl: ROOT,
      // Resolve workspace packages to source, not dist/*.d.ts, so a
      // type-scoped rename crosses package boundaries.
      paths: {
        '@cyberismo/data-handler': ['tools/data-handler/src/index.ts'],
        '@cyberismo/data-handler/*': ['tools/data-handler/src/*'],
        '@cyberismo/mcp': ['tools/mcp/src/index.ts'],
        '@cyberismo/backend': ['tools/backend/src/index.ts'],
      },
    },
    skipAddingFilesFromTsConfig: true,
  });
  for (const pkg of PACKAGES) {
    mp.addSourceFilesAtPaths([
      path.join(ROOT, 'tools', pkg, 'src/**/*.ts'),
      path.join(ROOT, 'tools', pkg, 'test/**/*.ts'),
      '!' + path.join(ROOT, 'tools', pkg, 'test/**/tmp-*/**'),
      '!**/node_modules/**',
    ]);
  }
  return mp;
}

// TS2307 "Cannot find module", TS2688 "Cannot find type definition file",
// TS7016 "Could not find a declaration file for module".
const UNRESOLVED_CODES = new Set([2307, 2688, 7016]);

function messageText(d) {
  const m = d.getMessageText();
  return typeof m === 'string' ? m : m.getMessageText();
}

function checkResolution(mp) {
  const mapped = Object.keys(mp.getCompilerOptions().paths || {});
  const pkgDirs = PACKAGES.map((p) => path.join(ROOT, 'tools', p) + path.sep);
  const bad = [];
  for (const d of mp.getPreEmitDiagnostics()) {
    if (!UNRESOLVED_CODES.has(d.getCode())) continue;
    const sf = d.getSourceFile();
    const file = sf ? sf.getFilePath() : '';
    if (sf && !pkgDirs.some((dir) => file.startsWith(dir))) continue;
    if (sf && sf.isInNodeModules()) continue;
    const text = messageText(d);
    const mod = (/'([^']+)'/.exec(text) || [])[1] || '';
    if (
      mod.startsWith('@cyberismo/') &&
      !mapped.some((m) =>
        m.endsWith('*') ? mod.startsWith(m.slice(0, -1)) : mod === m,
      )
    ) {
      continue;
    }
    bad.push(
      `  TS${d.getCode()} ${file ? path.relative(ROOT, file) : '(options)'}: ${text}`,
    );
  }
  if (bad.length) {
    throw new Error(
      `${bad.length} unresolved modules or types in ${ROOT}; ` +
        'run pnpm install there first. The renames follow types and ' +
        'would be incomplete:\n' +
        bad.slice(0, 10).join('\n') +
        (bad.length > 10 ? '\n  ...' : ''),
    );
  }
}

const RENAME_OPTS = {
  renameInComments: false,
  renameInStrings: false,
  usePrefixAndSuffixText: true,
};

function classIn(mp, file, names) {
  const sf = mp.getSourceFile(file);
  if (!sf) return undefined;
  for (const n of names) {
    const c = sf.getClass(n);
    if (c) return c;
  }
  return undefined;
}

function interfaceIn(mp, file, names) {
  const sf = mp.getSourceFile(file);
  if (!sf) return undefined;
  for (const n of names) {
    const c = sf.getInterface(n);
    if (c) return c;
  }
  return undefined;
}

function renameDecl(decl, to) {
  if (decl.getName() !== to) decl.rename(to, RENAME_OPTS);
}

// ---------------------------------------------------------------- phase 1

// ts-morph's move() writes extensionless relative specifiers; the repo uses
// NodeNext resolution, which needs `.js`.
function restoreJsExtensions(mp) {
  for (const sf of mp.getSourceFiles()) {
    const decls = [
      ...sf.getImportDeclarations(),
      ...sf.getExportDeclarations(),
    ];
    for (const d of decls) {
      const spec = d.getModuleSpecifierValue();
      if (!spec || !spec.startsWith('.') || /\.[cm]?js$|\.json$/.test(spec)) {
        continue;
      }
      const target = d.getModuleSpecifierSourceFile();
      if (!target || !target.getFilePath().endsWith('.ts')) continue;
      // A directory import resolves to its index; `dir.js` would not.
      if (path.posix.basename(spec) !== target.getBaseNameWithoutExtension()) {
        continue;
      }
      d.setModuleSpecifier(spec + '.js');
    }
  }
}

function phaseTypes(mp) {
  const checkout = classIn(mp, CHECKOUT_FILE, ['Project', 'Checkout']);
  renameDecl(checkout, 'Checkout');
  const opts = interfaceIn(mp, CHECKOUT_FILE, [
    'ProjectOptions',
    'CheckoutOptions',
  ]);
  renameDecl(opts, 'CheckoutOptions');

  const oldWs = mp.getSourceFile(OLD_WS_FILE);
  if (oldWs) {
    oldWs.move(NEW_WS_FILE);
    restoreJsExtensions(mp);
  }
  const ws = classIn(mp, NEW_WS_FILE, ['CommandManager', 'Workspace']);
  renameDecl(ws, 'Workspace');
  const wsOpts = interfaceIn(mp, NEW_WS_FILE, [
    'CommandManagerOptions',
    'WorkspaceOptions',
  ]);
  renameDecl(wsOpts, 'WorkspaceOptions');
}

// ---------------------------------------------------------------- phase 2

function isTargetType(type, classDecl) {
  if (!type) return false;
  const t = type.getNonNullableType();
  const sym = t.getSymbol();
  if (!sym) return false;
  return sym.getDeclarations().some((d) => d === classDecl);
}

const DECL_KINDS = new Set([
  SyntaxKind.Parameter,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.BindingElement,
  SyntaxKind.GetAccessor,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
]);

function collectDecls(mp, classDecl) {
  const out = [];
  for (const sf of mp.getSourceFiles()) {
    sf.forEachDescendant((node) => {
      if (!DECL_KINDS.has(node.getKind())) return;
      const nameNode = node.getNameNode && node.getNameNode();
      if (!nameNode || !Node.isIdentifier(nameNode)) return;
      if (isTargetType(node.getType(), classDecl)) {
        out.push(node);
      }
    });
  }
  return out;
}

function where(node) {
  return (
    path.relative(ROOT, node.getSourceFile().getFilePath()) +
    ':' +
    node.getStartLineNumber()
  );
}

// Target name per type. Only these source names are renamed; compound names
// (`moduleProject`, `mockCommands`, ...) keep their meaning and are left alone.
const NAME_MAP = {
  Checkout: { from: ['project'], to: 'checkout' },
  Workspace: { from: ['commands', 'commandManager'], to: 'ws' },
};

// An object literal key whose contextual type comes from outside the target
// declarations (e.g. a log-bindings record) is data, not a binding: keep it.
function isFreeKey(node, classDecl) {
  if (
    !Node.isPropertyAssignment(node) &&
    !Node.isShorthandPropertyAssignment(node)
  ) {
    return false;
  }
  const obj = node.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
  const ct = obj && obj.getContextualType();
  if (!ct || ct.isAny()) return false;
  const types = ct.isUnion() ? ct.getUnionTypes() : [ct];
  for (const t of types) {
    const prop = t.getProperty(node.getName());
    if (!prop) {
      if (t.getStringIndexType()) return true;
      continue;
    }
    for (const d of prop.getDeclarations()) {
      if (d.getSourceFile().isInNodeModules()) return true;
      if (!isTargetType(d.getType(), classDecl)) return true;
    }
  }
  return false;
}

// `{ checkout: checkout }` -> `{ checkout }` once both sides are renamed,
// in object literals and in destructuring patterns.
function shorthand(mp, names) {
  let n = 0;
  for (const sf of mp.getSourceFiles()) {
    const literals = sf
      .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter((pa) => {
        const init = pa.getInitializer();
        return (
          names.includes(pa.getName()) &&
          init &&
          Node.isIdentifier(init) &&
          init.getText() === pa.getName()
        );
      });
    const patterns = sf
      .getDescendantsOfKind(SyntaxKind.BindingElement)
      .filter((be) => {
        const prop = be.getPropertyNameNode();
        return (
          prop &&
          Node.isIdentifier(prop) &&
          names.includes(be.getName()) &&
          prop.getText() === be.getName()
        );
      });
    for (const node of [...literals, ...patterns].sort(
      (x, y) => y.getStart() - x.getStart(),
    )) {
      if (Node.isPropertyAssignment(node)) {
        node.replaceWithText(node.getName());
      } else {
        node.replaceWithText(node.getText().replace(/^(\w+)\s*:\s*\1\b/, '$1'));
      }
      n++;
    }
  }
  return n;
}

// Hono `ContextVariableMap.commands` is keyed by string literals in
// `c.get('commands')` / `c.set('commands', ...)`. Rename the literals passed
// to a Hono `Context`, and nothing else.
function isHonoContext(type) {
  const sym = type.getNonNullableType().getSymbol();
  return (
    !!sym &&
    sym.getName() === 'Context' &&
    sym
      .getDeclarations()
      .some((d) => /[\\/]hono[\\/]/.test(d.getSourceFile().getFilePath()))
  );
}

function honoKeys(mp, ws) {
  let n = 0;
  // The map entry and its keys change together so `c.get(...)` stays typed
  // while the identifier passes run.
  const entries = [];
  let declared = false;
  for (const sf of mp.getSourceFiles()) {
    for (const i of sf.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)) {
      if (i.getName() !== 'ContextVariableMap') continue;
      const prop = i.getProperty('commands');
      if (!prop) continue;
      declared = true;
      if (isTargetType(prop.getType(), ws)) entries.push(prop);
    }
  }
  for (const sf of mp.getSourceFiles()) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;
      const method = callee.getName();
      if (method !== 'get' && method !== 'set') continue;
      const [key] = call.getArguments();
      if (!key || !Node.isStringLiteral(key)) continue;
      if (key.getLiteralValue() !== 'commands') continue;
      if (!isHonoContext(callee.getExpression().getType())) continue;
      key.setLiteralValue('ws');
      n++;
    }
  }
  if (declared && !n) {
    throw new Error(
      'ContextVariableMap declares `commands` but no Hono key was renamed; ' +
        'is hono resolvable from the target tree?',
    );
  }
  for (const prop of entries) prop.rename('ws', RENAME_OPTS);
  return n;
}

// The JSDoc `@param` tags naming a parameter.
function paramTags(param, name) {
  const fn = param.getParent();
  if (!fn || !Node.isJSDocable(fn)) return [];
  return fn
    .getJsDocs()
    .flatMap((doc) => doc.getTags())
    .filter((t) => Node.isJSDocParameterTag(t) && t.getName() === name);
}

// Renames a parameter and its `@param` tags; returns the tag count.
function renameParam(param, to) {
  const from = param.getName();
  const tags = paramTags(param, from).length;
  param.rename(to, RENAME_OPTS);
  // The language service renames the tags too; catch any it missed.
  for (const t of paramTags(param, from)) {
    t.getNameNode().replaceWithText(to);
  }
  return tags;
}

const MAX_PASSES = 10;

function phaseIdentifiers(mp) {
  const targets = {
    Checkout: classIn(mp, CHECKOUT_FILE, ['Checkout']),
    Workspace: classIn(mp, NEW_WS_FILE, ['Workspace']),
  };
  if (!targets.Checkout || !targets.Workspace) {
    throw new Error('Run the types phase first');
  }
  if (REPORT) {
    for (const kind of Object.keys(targets)) {
      for (const node of collectDecls(mp, targets[kind])) {
        console.log(
          `${kind}\t${node.getName()}\t${node.getKindName()}\t${where(node)}`,
        );
      }
    }
    return;
  }
  const keys = honoKeys(mp, targets.Workspace);
  const free = new Set();
  let renamed = 0;
  let paramTags = 0;
  // Renaming one declaration can replace neighbouring nodes (a shorthand
  // becomes `key: local`), so collect again until nothing is left.
  for (let pass = 1; ; pass++) {
    let progress = 0;
    for (const kind of Object.keys(targets)) {
      const { from, to } = NAME_MAP[kind];
      for (const node of collectDecls(mp, targets[kind])) {
        if (node.wasForgotten() || !from.includes(node.getName())) continue;
        if (isFreeKey(node, targets[kind])) {
          free.add(where(node));
          continue;
        }
        let target = node;
        if (Node.isShorthandPropertyAssignment(node)) {
          // Renaming a shorthand renames the local; spell it out so the key
          // is renamed as a property. The local is its own declaration.
          const name = node.getName();
          target = node.replaceWithText(`${name}: ${name}`);
        }
        if (Node.isParameterDeclaration(target)) {
          paramTags += renameParam(target, to);
        } else {
          target.rename(to, RENAME_OPTS);
        }
        progress++;
      }
    }
    renamed += progress;
    if (!progress) break;
    if (pass >= MAX_PASSES) {
      throw new Error(
        `Identifier renames did not converge after ${MAX_PASSES} passes`,
      );
    }
  }
  const short = shorthand(
    mp,
    Object.values(NAME_MAP).map((m) => m.to),
  );
  console.log(
    `renamed ${renamed} declarations, ${short} shorthands, ${keys} Hono keys, ${paramTags} @param tags`,
  );
  for (const w of free) console.log(`kept free key: ${w}`);
}

// ---------------------------------------------------------------- phase 3

// Keys the type checker can't see. Each rule is idempotent.

// getLock reads the lock through a string-typed key.
function ruleGetLock(mp) {
  const sf = mp.getSourceFile(path.join(DH, 'utils/rw-lock.ts'));
  const fn = sf && sf.getFunction('getLock');
  if (!fn) return 0;
  const text = fn.getFullText();
  const next = text.replace(/\bproject\b/g, 'checkout');
  if (next === text) return 0;
  sf.replaceText([fn.getPos(), fn.getEnd()], next);
  return 1;
}

// rw-lock.test.ts fakes: class fields `project = { lock }`.
function ruleLockFakes(mp) {
  const sf = mp.getSourceFile(
    path.join(ROOT, 'tools/data-handler/test/rw-lock.test.ts'),
  );
  if (!sf) return 0;
  let n = 0;
  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
    if (prop.wasForgotten() || prop.getName() !== 'project') continue;
    const init = prop.getInitializer();
    if (!init || !Node.isObjectLiteralExpression(init)) continue;
    if (!init.getProperty('lock')) continue;
    prop.rename('checkout', RENAME_OPTS);
    n++;
  }
  return n;
}

// Object literals cast through `as unknown as Workspace`: their `project`
// key is invisible to the type checker.
function ruleWorkspaceMocks(mp) {
  let n = 0;
  for (const sf of mp.getSourceFiles()) {
    for (const outer of sf.getDescendantsOfKind(SyntaxKind.AsExpression)) {
      if (outer.wasForgotten()) continue;
      if (outer.getTypeNode().getText() !== 'Workspace') continue;
      const inner = outer.getExpression();
      if (!Node.isAsExpression(inner)) continue;
      if (inner.getTypeNode().getKind() !== SyntaxKind.UnknownKeyword) continue;
      let obj = inner.getExpression();
      while (Node.isParenthesizedExpression(obj)) obj = obj.getExpression();
      if (!Node.isObjectLiteralExpression(obj)) continue;
      const key = obj.getProperty('project');
      if (!key || !Node.isPropertyAssignment(key)) continue;
      key.getNameNode().replaceWithText('checkout');
      n++;
    }
  }
  return n;
}

function phaseSpecial(mp) {
  const a = ruleGetLock(mp);
  const b = ruleLockFakes(mp);
  const c = ruleWorkspaceMocks(mp);
  console.log(`special: getLock ${a}, lock fakes ${b}, Workspace mocks ${c}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const mp = loadProject();
  checkResolution(mp);
  if (phaseArg === 'types' || phaseArg === 'all') {
    phaseTypes(mp);
  }
  if (phaseArg === 'identifiers' || phaseArg === 'all') {
    phaseIdentifiers(mp);
    if (!REPORT) phaseSpecial(mp);
  }
  if (!REPORT) await mp.save();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
