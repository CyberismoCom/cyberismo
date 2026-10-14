/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A29a call-site codemod: MCP resolves a project through a ProjectDirectory
 * (async), and tests hand the backend and MCP the directory their handle
 * was opened from instead of wrapping its checkout. Call sites only; no
 * assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a29a-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules, MCP src (tools, resources and prompts index.ts):
 *   param     a `provider: ProjectProvider` parameter -> `directory:
 *             ProjectDirectory`, with every reference to it renamed.
 *   resolve   `resolveCommands(…)` -> `await resolveWorkspace(…)`.
 *   list      `directory.list()` -> `(await directory.list())`.
 *   import    from resolve-project.js: `resolveCommands` ->
 *             `resolveWorkspace`, `ProjectProvider` dropped;
 *             `type ProjectDirectory` added to the '@cyberismo/data-handler'
 *             import (a new type import if there is none).
 * Rules, backend and MCP tests:
 *   registry  `ProjectRegistry.fromCheckout(<x>.checkout)` ->
 *             `directoryOf(<x>)`.
 *   single    `singleProjectProvider(<x>.checkout)` -> `directoryOf(<x>)`.
 *   notExport `createApp(a, b, c, false, …)` -> `createApp(a, b, c,
 *             undefined, …)`: the fourth parameter now lists the prefixes
 *             of an export, and is unset outside one.
 *   import    `directoryOf` added to the helpers/open-test-workspace.js
 *             import; `ProjectRegistry` / `singleProjectProvider` imports
 *             dropped once nothing refers to them.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const MCP_SRC = ['tools', 'resources', 'prompts'].map((dir) =>
  path.join(ROOT, 'tools', 'mcp', 'src', dir, 'index.ts'),
);
const TESTS = ['backend', 'mcp'].map((pkg) =>
  path.join(ROOT, 'tools', pkg, 'test/**/*.ts'),
);

const morph = new MorphProject({ skipAddingFilesFromTsConfig: true });
morph.addSourceFilesAtPaths(MCP_SRC);
for (const glob of TESTS) morph.addSourceFilesAtPaths(glob);

const edits = [];
const note = (node, rule) =>
  edits.push(
    `${path.relative(ROOT, node.getSourceFile().getFilePath())}:${node.getStartLineNumber()} ${rule}`,
  );

function addNamedImport(file, moduleEnds, name, typeOnly) {
  const decl = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue().endsWith(moduleEnds));
  if (!decl) return false;
  if (decl.getNamedImports().some((n) => n.getName() === name)) return true;
  if (typeOnly && !decl.isTypeOnly()) {
    decl.addNamedImport({ name, isTypeOnly: true });
  } else {
    decl.addNamedImport(name);
  }
  return true;
}

function dropNamedImport(file, name) {
  for (const decl of file.getImportDeclarations()) {
    const named = decl.getNamedImports().find((n) => n.getName() === name);
    if (!named) continue;
    named.remove();
    if (
      decl.getNamedImports().length === 0 &&
      !decl.getDefaultImport() &&
      !decl.getNamespaceImport()
    ) {
      decl.remove();
    }
  }
}

const referenced = (file, name) =>
  file
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (id) =>
        id.getText() === name &&
        !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
    );

// MCP src.
for (const file of morph
  .getSourceFiles()
  .filter((f) => MCP_SRC.includes(path.resolve(f.getFilePath())))) {
  // param
  for (const param of file.getDescendantsOfKind(SyntaxKind.Parameter)) {
    if (
      param.getName() === 'provider' &&
      param.getTypeNode()?.getText() === 'ProjectProvider'
    ) {
      note(param, 'param');
      const fn = param.getParent();
      for (const id of fn.getDescendantsOfKind(SyntaxKind.Identifier)) {
        if (id.getText() === 'provider' && id !== param.getNameNode()) {
          id.replaceWithText('directory');
        }
      }
      param.getNameNode().replaceWithText('directory');
      param.setType('ProjectDirectory');
    }
  }
  // resolve
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    if (call.getExpression().getText() === 'resolveCommands') {
      note(call, 'resolve');
      call.replaceWithText(
        `await resolveWorkspace(${call
          .getArguments()
          .map((a) => a.getText())
          .join(', ')})`,
      );
    }
  }
  // list
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    if (
      call.getExpression().getText() === 'directory.list' &&
      call.getArguments().length === 0 &&
      !Node.isAwaitExpression(call.getParent())
    ) {
      note(call, 'list');
      call.replaceWithText('(await directory.list())');
    }
  }
  // import
  for (const decl of file.getImportDeclarations()) {
    if (!decl.getModuleSpecifierValue().endsWith('lib/resolve-project.js')) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      if (named.getName() === 'resolveCommands') {
        note(decl, 'import');
        named.setName('resolveWorkspace');
      }
    }
  }
  if (!referenced(file, 'ProjectProvider')) {
    const had = file
      .getImportDeclarations()
      .some((d) =>
        d.getNamedImports().some((n) => n.getName() === 'ProjectProvider'),
      );
    if (had) {
      dropNamedImport(file, 'ProjectProvider');
      if (
        !addNamedImport(
          file,
          '@cyberismo/data-handler',
          'ProjectDirectory',
          true,
        )
      ) {
        file.insertImportDeclaration(
          file
            .getImportDeclarations()
            .findIndex((d) =>
              d.getModuleSpecifierValue().endsWith('lib/resolve-project.js'),
            ),
          {
            moduleSpecifier: '@cyberismo/data-handler',
            namedImports: ['ProjectDirectory'],
            isTypeOnly: true,
          },
        );
      }
      note(file.getFirstDescendant() ?? file, 'import');
    }
  }
}

// Tests.
const WRAPPERS = new Map([
  ['ProjectRegistry.fromCheckout', ['registry', 'ProjectRegistry']],
  ['singleProjectProvider', ['single', 'singleProjectProvider']],
]);
for (const file of morph
  .getSourceFiles()
  .filter((f) => !MCP_SRC.includes(path.resolve(f.getFilePath())))) {
  let converted = false;
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    if (
      call.getExpression().getText() === 'createApp' &&
      call.getArguments()[3]?.getKind() === SyntaxKind.FalseKeyword
    ) {
      note(call, 'notExport');
      call.getArguments()[3].replaceWithText('undefined');
      continue;
    }
    const wrapper = WRAPPERS.get(call.getExpression().getText());
    const [arg] = call.getArguments();
    if (
      !wrapper ||
      call.getArguments().length !== 1 ||
      !Node.isPropertyAccessExpression(arg) ||
      arg.getName() !== 'checkout'
    ) {
      continue;
    }
    note(call, wrapper[0]);
    call.replaceWithText(`directoryOf(${arg.getExpression().getText()})`);
    converted = true;
  }
  if (!converted) continue;
  if (!addNamedImport(file, 'helpers/open-test-workspace.js', 'directoryOf')) {
    throw new Error(
      `${file.getFilePath()}: no helpers/open-test-workspace.js import`,
    );
  }
  for (const [, name] of WRAPPERS.values()) {
    if (!referenced(file, name)) dropNamedImport(file, name);
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.error(`${edits.length} edits`);
