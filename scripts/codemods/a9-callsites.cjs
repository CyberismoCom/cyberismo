/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A9 call-site codemod: tests obtain their workspace handle from the
 * package's `openTestWorkspace` helper, and the backend registry holds
 * checkouts. Call sites only; no assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a9-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules (test files of data-handler, backend and mcp):
 *   open      `Workspace.getInstance(a)` -> `openTestWorkspace(a)`;
 *             `new Workspace(a)` -> `await openTestWorkspace(a)`, and a
 *             directly following `await x.initialize()` of the same
 *             variable is dropped (the helper opens and loads);
 *   registry  `ProjectRegistry.fromCommandManager(x)` ->
 *             `ProjectRegistry.fromCheckout(x.checkout)`; an entry
 *             `{ prefix, ws: x }` -> `{ prefix, checkout: x.checkout }`;
 *             `.eventsFor(ws)` -> `.eventsFor(ws.checkout)`;
 *   provider  `singleProjectProvider(x)` -> `singleProjectProvider(x.checkout)`
 *             (mcp: providers hand out checkouts);
 *   import    the helper is imported; `Workspace` is dropped from imports
 *             when unused, or imported as a type when only types use it.
 *
 * Rules for writes that no handle opens (data-handler tests only):
 *   legacy    `new X(c, ...)` of a legacy command with writes ->
 *             `Workspace.over(c, SYSTEM_ACTOR).xCmd`, the
 *             handle's proxy over the checkout's shared object; a variable
 *             left unused by that (a collaborator argument) is dropped;
 *   mutations `m.apply(i)` on `new ResourceMutations(c)` ->
 *             `Workspace.over(c, SYSTEM_ACTOR).updateCmd.apply(i)`;
 *             with an origin, `m.apply(i, o)` ->
 *             `c.lock.write(SYSTEM_FRAME, () => m.apply(i, o))`;
 *   replay    `executeModuleReplays(c, ...)` ->
 *             `c.lock.write(SYSTEM_FRAME, () => executeModuleReplays(c, ...))`;
 *   lock      in rw-lock.test.ts, `lock.write(fn)` -> `lock.write(SYSTEM_FRAME,
 *             fn)`, and a call of a local class's @write method outside a
 *             class body -> `lock.write(SYSTEM_FRAME, () => call)`.
 * The mutations and replay rules leave a checkout declared as a stub
 * (`as unknown as Checkout`) alone: its lock ignores frames.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp'];
const HELPER = 'test/helpers/open-test-workspace.ts';

const morph = new MorphProject({ skipAddingFilesFromTsConfig: true });
for (const pkg of PACKAGES) {
  morph.addSourceFilesAtPaths(path.join(ROOT, 'tools', pkg, 'test/**/*.ts'));
}

const edits = [];
const note = (node, rule) =>
  edits.push(
    `${path.relative(ROOT, node.getSourceFile().getFilePath())}:${node.getStartLineNumber()} ${rule}`,
  );

const LEGACY = [
  'Clean',
  'Create',
  'Edit',
  'Fetch',
  'Import',
  'Modules',
  'Move',
  'Publish',
  'Remove',
  'Rename',
  'Transition',
  'Update',
  'Version',
];
const legacyKey = (name) => `${name[0].toLowerCase()}${name.slice(1)}Cmd`;
const handleOf = (checkout) => `Workspace.over(${checkout}, SYSTEM_ACTOR)`;

const isWorkspace = (node) =>
  Node.isIdentifier(node) && node.getText() === 'Workspace';

// Name the statement holding `expr` assigns to, if any.
function assignedName(expr) {
  const parent = expr.getParent();
  if (Node.isVariableDeclaration(parent)) return parent.getName();
  if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
  ) {
    return parent.getLeft().getText();
  }
  return undefined;
}

function dropInitialize(expr, name) {
  const statement = expr.getFirstAncestor((n) => {
    const parent = n.getParent();
    return Node.isBlock(parent) || Node.isSourceFile(parent);
  });
  const next = statement?.getNextSibling();
  if (
    next &&
    Node.isExpressionStatement(next) &&
    next.getText().replace(/\s/g, '') === `await${name}.initialize();`
  ) {
    note(next, 'open (drop initialize)');
    next.remove();
  }
}

function rewriteOpen(file) {
  let changed = false;
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    const callee = call.getExpression();
    if (
      Node.isPropertyAccessExpression(callee) &&
      isWorkspace(callee.getExpression()) &&
      callee.getName() === 'getInstance'
    ) {
      note(call, 'open');
      callee.replaceWithText('openTestWorkspace');
      changed = true;
    }
  }
  for (const created of file.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (created.wasForgotten() || !isWorkspace(created.getExpression())) {
      continue;
    }
    note(created, 'open');
    const name = assignedName(created);
    const args = created.getArguments().map((a) => a.getText());
    const replaced = created.replaceWithText(
      `await openTestWorkspace(${args.join(', ')})`,
    );
    if (name) dropInitialize(replaced, name);
    changed = true;
  }
  return changed;
}

function rewriteRegistry(file) {
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const [arg] = call.getArguments();
    if (
      callee.getName() === 'fromCommandManager' &&
      callee.getExpression().getText() === 'ProjectRegistry'
    ) {
      note(call, 'registry');
      callee.getNameNode().replaceWithText('fromCheckout');
      arg.replaceWithText(`${arg.getText()}.checkout`);
    } else if (callee.getName() === 'eventsFor' && arg?.getText() === 'ws') {
      note(call, 'registry');
      arg.replaceWithText(`${arg.getText()}.checkout`);
    }
  }
  for (const literal of file.getDescendantsOfKind(
    SyntaxKind.ObjectLiteralExpression,
  )) {
    if (literal.wasForgotten()) continue;
    const ws = literal.getProperty('ws');
    if (!literal.getProperty('prefix') || !ws) continue;
    note(literal, 'registry');
    const value = Node.isShorthandPropertyAssignment(ws)
      ? ws.getName()
      : ws.getInitializerOrThrow().getText();
    ws.replaceWithText(`checkout: ${value}.checkout`);
  }
}

function rewriteProvider(file) {
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const [arg] = call.getArguments();
    if (
      call.getExpression().getText() !== 'singleProjectProvider' ||
      !arg ||
      arg.getText().endsWith('.checkout')
    ) {
      continue;
    }
    note(call, 'provider');
    arg.replaceWithText(`${arg.getText()}.checkout`);
  }
}

function fixImports(file, pkg) {
  const helper = path.join(ROOT, 'tools', pkg, HELPER);
  let specifier = path
    .relative(path.dirname(file.getFilePath()), helper)
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '.js');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  if (!file.getImportDeclaration(specifier)) {
    file.addImportDeclaration({
      moduleSpecifier: specifier,
      namedImports: ['openTestWorkspace'],
    });
  }
  const uses = file
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (id) =>
        id.getText() === 'Workspace' &&
        !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
    );
  for (const decl of file.getImportDeclarations()) {
    for (const named of decl.getNamedImports()) {
      if (named.getName() !== 'Workspace') continue;
      if (uses.length === 0) {
        named.remove();
        if (
          decl.getNamedImports().length === 0 &&
          !decl.getDefaultImport() &&
          !decl.getNamespaceImport()
        ) {
          decl.remove();
        }
      } else if (
        !decl.isTypeOnly() &&
        uses.every((id) => id.getFirstAncestorByKind(SyntaxKind.TypeReference))
      ) {
        named.setIsTypeOnly(true);
      }
    }
  }
}

// Relative import specifier from `file` to `target` (a .ts path).
function specifierTo(file, target) {
  let spec = path
    .relative(path.dirname(file.getFilePath()), target)
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '.js');
  return spec.startsWith('.') ? spec : `./${spec}`;
}

// Import `names` as values from `target`, reusing an import of the name.
function importValues(file, target, names) {
  for (const name of names) {
    const existing = file
      .getImportDeclarations()
      .flatMap((d) => d.getNamedImports().map((n) => [d, n]))
      .find(([, n]) => n.getName() === name);
    if (existing) {
      const [decl, named] = existing;
      if (decl.isTypeOnly()) {
        decl.setIsTypeOnly(false);
        for (const other of decl.getNamedImports()) {
          if (other !== named) other.setIsTypeOnly(true);
        }
      }
      named.setIsTypeOnly(false);
      continue;
    }
    const spec = specifierTo(file, target);
    const decl = file.getImportDeclaration(
      (d) => d.getModuleSpecifierValue() === spec && !d.isTypeOnly(),
    );
    if (decl) decl.addNamedImport(name);
    else
      file.addImportDeclaration({
        moduleSpecifier: spec,
        namedImports: [name],
      });
  }
}

// Drop the named imports of `names` that nothing references any more, and
// import as types those that only types reference.
function dropUnused(file, names) {
  for (const decl of file.getImportDeclarations()) {
    let touched = false;
    for (const named of decl.getNamedImports()) {
      const name = named.getName();
      if (!names.includes(name)) continue;
      const uses = file
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter(
          (id) =>
            id.getText() === name &&
            !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
        );
      if (uses.length === 0) {
        named.remove();
        touched = true;
      } else if (
        !decl.isTypeOnly() &&
        !named.isTypeOnly() &&
        uses.every((id) => id.getFirstAncestorByKind(SyntaxKind.TypeReference))
      ) {
        named.setIsTypeOnly(true);
        touched = true;
      }
    }
    if (!touched) continue;
    const remaining = decl.getNamedImports();
    if (remaining.length === 0 && !decl.getDefaultImport()) {
      decl.remove();
    } else if (
      !decl.isTypeOnly() &&
      !decl.getDefaultImport() &&
      remaining.every((n) => n.isTypeOnly())
    ) {
      for (const n of remaining) n.setIsTypeOnly(false);
      decl.setIsTypeOnly(true);
    }
  }
}

const STUB = /as unknown as Checkout/;

// Whether `node` names a stub checkout: declared, assigned or built by a
// local factory as `... as unknown as Checkout`.
function isStub(node) {
  if (!Node.isIdentifier(node)) return false;
  const file = node.getSourceFile();
  const name = node.getText();
  const values = [
    ...(node.getSymbol()?.getDeclarations() ?? [])
      .filter((d) => Node.isVariableDeclaration(d))
      .map((d) => d.getInitializer()),
    ...file
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .filter((b) => b.getLeft().getText() === name)
      .map((b) => b.getRight()),
  ].filter(Boolean);
  return values.some((value) => {
    if (STUB.test(value.getText())) return true;
    if (!Node.isCallExpression(value)) return false;
    const factory = value.getExpression().getSymbol()?.getDeclarations()[0];
    return factory !== undefined && STUB.test(factory.getText());
  });
}

// Whether `call` already runs inside a system frame opened here.
const inSystemFrame = (call) =>
  call
    .getAncestors()
    .some(
      (a) =>
        Node.isCallExpression(a) &&
        a.getArguments()[0]?.getText() === 'SYSTEM_FRAME',
    );

// Initializer of the variable `id` names, if it is one.
function initializerOf(id) {
  const decl = id.getSymbol()?.getDeclarations()[0];
  return decl && Node.isVariableDeclaration(decl)
    ? decl.getInitializer()
    : undefined;
}

// Drops declarations of variables in `names` that nothing reads any more.
function dropUnusedVariables(file, names) {
  for (const decl of file.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration,
  )) {
    if (decl.wasForgotten() || !names.has(decl.getName())) continue;
    const refs = decl
      .getNameNode()
      .findReferencesAsNodes()
      .filter((n) => n !== decl.getNameNode());
    if (refs.length > 0) continue;
    note(decl, 'legacy (drop unused)');
    decl.getVariableStatementOrThrow().remove();
  }
}

function rewriteLegacy(file) {
  const touched = new Set();
  const created = file
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((n) => LEGACY.includes(n.getExpression().getText()))
    .filter(
      (n) =>
        !n
          .getAncestors()
          .some(
            (a) =>
              Node.isNewExpression(a) &&
              LEGACY.includes(a.getExpression().getText()),
          ),
    );
  let changed = false;
  for (const node of created) {
    const [checkout] = node.getArguments();
    if (!checkout) continue;
    for (const arg of node.getArguments().slice(1)) {
      for (const id of [
        arg,
        ...arg.getDescendantsOfKind(SyntaxKind.Identifier),
      ]) {
        if (Node.isIdentifier(id)) touched.add(id.getText());
      }
    }
    note(node, 'legacy');
    node.replaceWithText(
      `${handleOf(checkout.getText())}.${legacyKey(node.getExpression().getText())}`,
    );
    changed = true;
  }
  dropUnusedVariables(file, touched);
  return changed;
}

function rewriteMutations(file) {
  const touched = new Set();
  let changed = false;
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    const callee = call.getExpression();
    if (
      !Node.isPropertyAccessExpression(callee) ||
      callee.getName() !== 'apply'
    )
      continue;
    let target = callee.getExpression();
    const variable = Node.isIdentifier(target) ? target.getText() : undefined;
    if (variable) target = initializerOf(target);
    if (
      !target ||
      !Node.isNewExpression(target) ||
      target.getExpression().getText() !== 'ResourceMutations'
    ) {
      continue;
    }
    if (variable) touched.add(variable);
    const checkoutNode = target.getArguments()[0];
    if (!checkoutNode || isStub(checkoutNode) || inSystemFrame(call)) continue;
    const checkout = checkoutNode.getText();
    const args = call.getArguments().map((a) => a.getText());
    if (args.length === 1) {
      note(call, 'mutations');
      call.replaceWithText(`${handleOf(checkout)}.updateCmd.apply(${args[0]})`);
    } else {
      note(call, 'mutations (origin)');
      call.replaceWithText(
        `${checkout}.lock.write(SYSTEM_FRAME, () => ${call.getText()})`,
      );
    }
    changed = true;
  }
  dropUnusedVariables(file, touched);
  return changed;
}

function rewriteReplay(file) {
  let changed = false;
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (
      call.wasForgotten() ||
      call.getExpression().getText() !== 'executeModuleReplays'
    ) {
      continue;
    }
    const checkoutNode = call.getArguments()[0];
    if (!checkoutNode || isStub(checkoutNode) || inSystemFrame(call)) continue;
    const checkout = checkoutNode.getText();
    note(call, 'replay');
    call.replaceWithText(
      `${checkout}.lock.write(SYSTEM_FRAME, () => ${call.getText()})`,
    );
    changed = true;
  }
  return changed;
}

function rewriteLock(file) {
  const writeMethods = new Set();
  for (const cls of file.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
    for (const m of cls.getMethods()) {
      if (m.getDecorators().some((d) => d.getName() === 'write'))
        writeMethods.add(m.getName());
    }
  }
  let changed = false;
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    if (
      callee.getName() === 'write' &&
      callee.getExpression().getText() === 'lock' &&
      call.getArguments().length === 1
    ) {
      note(call, 'lock');
      call.insertArgument(0, 'SYSTEM_FRAME');
      changed = true;
    } else if (
      writeMethods.has(callee.getName()) &&
      !callee.getExpression().getText().startsWith('this') &&
      !call.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) &&
      !inSystemFrame(call)
    ) {
      note(call, 'lock (decorated call)');
      call.replaceWithText(`lock.write(SYSTEM_FRAME, () => ${call.getText()})`);
      changed = true;
    }
  }
  return changed;
}

const DH_SRC = path.join(ROOT, 'tools/data-handler/src');
for (const file of morph.getSourceFiles()) {
  if (
    !file.getFilePath().startsWith(path.join(ROOT, 'tools/data-handler/test/'))
  )
    continue;
  const legacy = rewriteLegacy(file);
  const mutations = rewriteMutations(file);
  const replay = rewriteReplay(file);
  const lock = file.getBaseName() === 'rw-lock.test.ts' && rewriteLock(file);
  if (legacy || mutations) {
    importValues(file, path.join(DH_SRC, 'workspace/workspace.ts'), [
      'Workspace',
    ]);
    importValues(file, path.join(DH_SRC, 'utils/tx-record.ts'), [
      'SYSTEM_ACTOR',
    ]);
  }
  if (mutations || replay || lock) {
    importValues(file, path.join(DH_SRC, 'utils/tx-record.ts'), [
      'SYSTEM_FRAME',
    ]);
  }
  dropUnused(file, [
    ...LEGACY,
    'ResourceMutations',
    'SYSTEM_ACTOR',
    'SYSTEM_FRAME',
  ]);
}

for (const pkg of PACKAGES) {
  const base = path.join(ROOT, 'tools', pkg);
  for (const file of morph.getSourceFiles()) {
    if (!file.getFilePath().startsWith(`${base}/`)) continue;
    if (file.getFilePath() === path.join(base, HELPER)) continue;
    if (rewriteOpen(file)) fixImports(file, pkg);
    if (pkg === 'backend') rewriteRegistry(file);
    if (pkg === 'mcp') rewriteProvider(file);
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.log(`${edits.length} sites`);
