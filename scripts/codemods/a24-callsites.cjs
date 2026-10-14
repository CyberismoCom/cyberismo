/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A24 call-site codemod: tests stop using the legacy module commands
 * (modulesCmd, fetchCmd, the module branch of removeCmd, Show's hub reads)
 * and call the per-handle modules façade instead. Call sites only; no
 * assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a24-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules (test files of data-handler, backend, mcp and cli):
 *   modules   `<x>.modulesCmd` -> `<x>.modules`; a mock's `modulesCmd:` key
 *             -> `modules:`.
 *   fetch     `<x>.fetchCmd` -> `<x>.modules`; in workspace/handle.test.ts,
 *             which probes a legacy proxy, -> `<x>.importCmd`.
 *   fetchType `let fetchCmd: Fetch` -> `let fetchCmd: Workspace['modules']`.
 *   fetchSpy  `vi.spyOn(fetchCmd as any, 'fetchModuleList')` ->
 *             `vi.spyOn(Fetch.prototype as any, 'fetchModuleList')`: the
 *             façade keeps its Fetch private.
 *   hubRead   `<x>.showCmd.showImportableModules|showHubDetails|showHubs(…)`
 *             -> `<x>.modules.importable|hubDetails|hubs(…)`; through a
 *             local `new Show(c)`, the local becomes
 *             `Workspace.over(c, SYSTEM_ACTOR).modules` and an unused Show
 *             import is dropped.
 *   remove    `<x>.removeCmd.remove('module', name)` (also through a local
 *             alias of the proxy) -> `<x>.modules.remove(name)`.
 *   source    `Source` imported from src/modules/types.js -> from
 *             '@cyberismo/model'.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const HUB_READS = new Map([
  ['showImportableModules', 'importable'],
  ['showHubDetails', 'hubDetails'],
  ['showHubs', 'hubs'],
]);

const morph = new MorphProject({ skipAddingFilesFromTsConfig: true });
for (const pkg of PACKAGES) {
  morph.addSourceFilesAtPaths(path.join(ROOT, 'tools', pkg, 'test/**/*.ts'));
}

const edits = [];
const note = (node, rule) =>
  edits.push(
    `${path.relative(ROOT, node.getSourceFile().getFilePath())}:${node.getStartLineNumber()} ${rule}`,
  );

const literal = (node) =>
  Node.isStringLiteral(node) ? node.getLiteralValue() : undefined;

// The only variable declaration an identifier refers to, if any.
function localDeclaration(id) {
  if (!Node.isIdentifier(id)) return undefined;
  const decls = (id.getSymbol()?.getDeclarations() ?? []).filter((d) =>
    Node.isVariableDeclaration(d),
  );
  return decls.length === 1 ? decls[0] : undefined;
}

// `<x>.<name>` directly, or through a local whose initializer is that.
function accessOf(recv, name) {
  if (Node.isPropertyAccessExpression(recv) && recv.getName() === name) {
    return { access: recv };
  }
  const init = localDeclaration(recv)?.getInitializer();
  if (
    init &&
    Node.isPropertyAccessExpression(init) &&
    init.getName() === name
  ) {
    return { access: init };
  }
  return undefined;
}

for (const file of morph.getSourceFiles()) {
  const isHandleTest = file
    .getFilePath()
    .endsWith(path.join('test', 'workspace', 'handle.test.ts'));
  const plan = [];
  const showLocals = new Set();

  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const method = call.getExpression();
    if (!Node.isPropertyAccessExpression(method)) continue;
    const args = call.getArguments();
    const recv = method.getExpression();

    // remove: the module branch of Remove.
    if (
      method.getName() === 'remove' &&
      args.length === 2 &&
      literal(args[0]) === 'module'
    ) {
      const found = accessOf(recv, 'removeCmd');
      if (found) {
        plan.push({
          node: call,
          rule: 'remove',
          apply: () => {
            call.removeArgument(0);
            found.access.getNameNode().replaceWithText('modules');
          },
        });
        continue;
      }
    }

    // hubRead: Show's hub reads.
    const renamed = HUB_READS.get(method.getName());
    if (renamed) {
      if (
        Node.isPropertyAccessExpression(recv) &&
        recv.getName() === 'showCmd'
      ) {
        plan.push({
          node: call,
          rule: 'hubRead',
          apply: () => {
            method.getNameNode().replaceWithText(renamed);
            recv.getNameNode().replaceWithText('modules');
          },
        });
        continue;
      }
      const decl = localDeclaration(recv);
      const init = decl?.getInitializer();
      if (
        init &&
        Node.isNewExpression(init) &&
        init.getExpression().getText() === 'Show' &&
        init.getArguments().length === 1
      ) {
        showLocals.add(decl);
        plan.push({
          node: call,
          rule: 'hubRead',
          apply: () => method.getNameNode().replaceWithText(renamed),
        });
        continue;
      }
    }

    // fetchSpy: a spy on the legacy Fetch's private check.
    if (
      method.getName() === 'spyOn' &&
      method.getExpression().getText() === 'vi' &&
      args.length === 2 &&
      literal(args[1]) === 'fetchModuleList' &&
      Node.isAsExpression(args[0]) &&
      args[0].getExpression().getText() === 'fetchCmd'
    ) {
      plan.push({
        node: call,
        rule: 'fetchSpy',
        apply: () => args[0].getExpression().replaceWithText('Fetch.prototype'),
      });
    }
  }

  for (const decl of showLocals) {
    const init = decl.getInitializer();
    const checkout = init.getArguments()[0].getText();
    plan.push({
      node: decl,
      rule: 'hubRead (local)',
      apply: () =>
        init.replaceWithText(
          `Workspace.over(${checkout}, SYSTEM_ACTOR).modules`,
        ),
    });
  }

  for (const access of file.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    const name = access.getName();
    if (name === 'modulesCmd') {
      plan.push({
        node: access,
        rule: 'modules',
        apply: () => access.getNameNode().replaceWithText('modules'),
      });
    } else if (name === 'fetchCmd') {
      const to = isHandleTest ? 'importCmd' : 'modules';
      plan.push({
        node: access,
        rule: 'fetch',
        apply: () => access.getNameNode().replaceWithText(to),
      });
    }
  }

  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (prop.getName() === 'modulesCmd') {
      plan.push({
        node: prop,
        rule: 'modules',
        apply: () => prop.getNameNode().replaceWithText('modules'),
      });
    }
  }

  for (const decl of file.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration,
  )) {
    if (
      decl.getName() === 'fetchCmd' &&
      decl.getTypeNode()?.getText() === 'Fetch'
    ) {
      plan.push({
        node: decl,
        rule: 'fetchType',
        apply: () => decl.setType(`Workspace['modules']`),
      });
    }
  }

  for (const imp of file.getImportDeclarations()) {
    if (!imp.getModuleSpecifierValue().endsWith('src/modules/types.js')) {
      continue;
    }
    const source = imp.getNamedImports().find((n) => n.getName() === 'Source');
    if (!source) continue;
    plan.push({
      node: imp,
      rule: 'source',
      apply: () => {
        source.remove();
        file.insertImportDeclaration(imp.getChildIndex(), {
          isTypeOnly: true,
          moduleSpecifier: '@cyberismo/model',
          namedImports: ['Source'],
        });
      },
    });
  }

  // Deepest first, so an edit never invalidates a node edited after it.
  plan.sort((a, b) => b.node.getStart() - a.node.getStart());
  for (const entry of plan) note(entry.node, entry.rule);
  for (const entry of plan) entry.apply();

  if (showLocals.size > 0) {
    const showImport = file
      .getImportDeclarations()
      .flatMap((d) => d.getNamedImports())
      .find((n) => n.getName() === 'Show');
    const used = file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (id) => id.getText() === 'Show' && id !== showImport?.getNameNode(),
      );
    if (showImport && used.length === 0) {
      const decl = showImport.getImportDeclaration();
      note(decl, 'unused Show import removed');
      if (decl.getNamedImports().length === 1) decl.remove();
      else showImport.remove();
    }
  }
}

morph.saveSync();
for (const edit of edits.sort()) console.log(edit);
console.log(`${edits.length} edits`);
