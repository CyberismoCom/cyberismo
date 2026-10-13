/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A23 call-site codemod: setup calls in other groups' tests stop going through
 * the resource branches the dispatcher and Remove lose. Call sites only; no
 * assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a23-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules (test files of data-handler, backend, mcp and cli):
 *   delete  `<h>.removeCmd.remove('<resource type>', name)` (also through a
 *           local alias of the proxy) -> `<h>.changes.apply({ kind: 'delete',
 *           target: resourceName(name) })`, importing resourceName from
 *           src/utils/resource-utils.js; an alias left unused is removed.
 *   reload  `await <x>.command(Cmd.show, ['project'], options);` as a
 *           statement, which only opens the project, ->
 *           `await <x>.command(Cmd.show, ['modules'], options);`.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const RESOURCE_UTILS = path.join(
  ROOT,
  'tools',
  'data-handler',
  'src',
  'utils',
  'resource-utils.js',
);
const RESOURCE_TYPES = new Set([
  'calculation',
  'cardType',
  'fieldType',
  'graphModel',
  'graphView',
  'linkType',
  'report',
  'skill',
  'template',
  'workflow',
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

// The handle a `removeCmd` receiver belongs to, and the alias it went through.
function removeOwner(recv) {
  if (Node.isPropertyAccessExpression(recv)) {
    return recv.getName() === 'removeCmd'
      ? { owner: recv.getExpression().getText() }
      : undefined;
  }
  if (!Node.isIdentifier(recv)) return undefined;
  const decls = (recv.getSymbol()?.getDeclarations() ?? []).filter((d) =>
    Node.isVariableDeclaration(d),
  );
  if (decls.length !== 1) return undefined;
  const init = decls[0].getInitializer();
  if (
    !init ||
    !Node.isPropertyAccessExpression(init) ||
    init.getName() !== 'removeCmd'
  ) {
    return undefined;
  }
  return { owner: init.getExpression().getText(), alias: decls[0] };
}

// Whether the call is a statement of its own: `await x.command(...);`.
const resultUnused = (call) => {
  const parent = call.getParent();
  return (
    Node.isAwaitExpression(parent) &&
    Node.isExpressionStatement(parent.getParent())
  );
};

const aliases = new Set();
const needsImport = new Set();

for (const file of morph.getSourceFiles()) {
  const plan = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const method = call.getExpression();
    if (!Node.isPropertyAccessExpression(method)) continue;
    const args = call.getArguments();

    if (method.getName() === 'remove' && args.length === 2) {
      const type = literal(args[0]);
      const remove = removeOwner(method.getExpression());
      if (remove && RESOURCE_TYPES.has(type)) {
        plan.push({
          call,
          rule: 'delete',
          apply: () =>
            call.replaceWithText(
              `${remove.owner}.changes.apply({ kind: 'delete', target: resourceName(${args[1].getText()}) })`,
            ),
        });
        if (remove.alias) aliases.add(remove.alias);
        needsImport.add(file);
        continue;
      }
    }

    if (
      method.getName() === 'command' &&
      args.length === 3 &&
      args[0].getText() === 'Cmd.show' &&
      Node.isArrayLiteralExpression(args[1]) &&
      args[1].getElements().length === 1 &&
      literal(args[1].getElements()[0]) === 'project' &&
      resultUnused(call)
    ) {
      plan.push({
        call,
        rule: 'reload',
        apply: () => args[1].replaceWithText(`['modules']`),
      });
    }
  }
  for (const entry of plan) note(entry.call, entry.rule);
  for (const entry of plan.toReversed()) entry.apply();
}

// An alias no longer mentioned anywhere else in its block.
for (const decl of aliases) {
  const stmt = decl.getVariableStatement();
  if (!stmt || stmt.getDeclarations().length !== 1) continue;
  const name = decl.getName();
  const uses = stmt
    .getParentOrThrow()
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (id) =>
        id.getText() === name &&
        !(
          Node.isPropertyAccessExpression(id.getParent()) &&
          id.getParent().getNameNode() === id
        ),
    );
  if (uses.length === 1) {
    note(stmt, 'unused alias removed');
    stmt.remove();
  }
}

for (const file of needsImport) {
  const spec = path
    .relative(path.dirname(file.getFilePath()), RESOURCE_UTILS)
    .split(path.sep)
    .join('/');
  const specifier = spec.startsWith('.') ? spec : `./${spec}`;
  const existing = file.getImportDeclaration(
    (d) => d.getModuleSpecifierValue() === specifier,
  );
  if (existing) {
    if (
      !existing.getNamedImports().some((n) => n.getName() === 'resourceName')
    ) {
      existing.addNamedImport('resourceName');
    }
  } else {
    file.insertImportDeclaration(file.getImportDeclarations().length, {
      moduleSpecifier: specifier,
      namedImports: ['resourceName'],
    });
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.log(`${edits.length} edits`);
