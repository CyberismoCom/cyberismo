/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A23r call-site codemod: tests stop using Show's resource and project
 * reads and call the per-handle resources and settings façades instead.
 * Call sites only; no assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a23r-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules (test files of data-handler, backend, mcp and cli), for a call on
 * `<x>.showCmd`, on a local `showCmd: Show` assigned `<x>.showCmd`, or on a
 * local `new Show(c)` (which becomes `Workspace.over(c, SYSTEM_ACTOR)`):
 *   list      `showResources(t)` -> `<x>.resources.list(t)`.
 *   show      `showResource(n[, type])` -> `<x>.resources.show(n[, type])`;
 *             a call with a boolean argument (where-used) is left alone.
 *   info      `showProject()` -> `<x>.settings.info()`.
 *   contents  `showCardTypesWithDetails|showWorkflowsWithDetails|
 *             showTemplatesWithDetails()` -> `<x>.resources.contents(
 *             'cardTypes'|'workflows'|'templates')`.
 *   local     once a `showCmd: Show` local has no other use, its declaration,
 *             its assignment and the unused Show import go.
 *   mock      a mock's `showCmd: { showProject, showResources, showResource,
 *             …overrides.showCmd }` -> `settings: { info, …overrides.settings
 *             }` and `resources: { list, show, …overrides.resources }`; the
 *             mock of `showFileNames`, a method Show does not have, goes.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const CONTENTS = new Map([
  ['showCardTypesWithDetails', 'cardTypes'],
  ['showWorkflowsWithDetails', 'workflows'],
  ['showTemplatesWithDetails', 'templates'],
]);
const MOCKED = new Map([
  ['showProject', ['settings', 'info']],
  ['showResources', ['resources', 'list']],
  ['showResource', ['resources', 'show']],
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

// The new call for a Show read on `base`, or undefined to leave it.
function rewrite(name, args, base) {
  const text = args.map((arg) => arg.getText()).join(', ');
  if (name === 'showResources')
    return ['list', `${base}.resources.list(${text})`];
  if (name === 'showResource') {
    const flagged = args.some(
      (arg) =>
        arg.getKind() === SyntaxKind.TrueKeyword ||
        arg.getKind() === SyntaxKind.FalseKeyword,
    );
    return flagged ? undefined : ['show', `${base}.resources.show(${text})`];
  }
  if (name === 'showProject') return ['info', `${base}.settings.info()`];
  const type = CONTENTS.get(name);
  if (type) return ['contents', `${base}.resources.contents('${type}')`];
  return undefined;
}

// The only variable declaration an identifier refers to, if any.
function localDeclaration(id) {
  if (!Node.isIdentifier(id)) return undefined;
  const decls = (id.getSymbol()?.getDeclarations() ?? []).filter((d) =>
    Node.isVariableDeclaration(d),
  );
  return decls.length === 1 ? decls[0] : undefined;
}

// `<x>` of the one `local = <x>.showCmd` assignment, if the local is a Show.
function showAssignment(decl) {
  if (decl.getTypeNode()?.getText() !== 'Show') return undefined;
  const assignments = decl
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(
      (bin) =>
        bin.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
        bin.getLeft().getText() === decl.getName(),
    );
  if (assignments.length !== 1) return undefined;
  const right = assignments[0].getRight();
  if (
    !Node.isPropertyAccessExpression(right) ||
    right.getName() !== 'showCmd'
  ) {
    return undefined;
  }
  return { statement: assignments[0].getParent(), base: right.getExpression() };
}

for (const file of morph.getSourceFiles()) {
  const plan = [];
  const showLocals = new Map();
  const newShows = new Set();

  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const method = call.getExpression();
    if (!Node.isPropertyAccessExpression(method)) continue;
    const recv = method.getExpression();
    let base;
    if (Node.isPropertyAccessExpression(recv) && recv.getName() === 'showCmd') {
      base = recv.getExpression().getText();
    } else {
      const decl = localDeclaration(recv);
      const init = decl?.getInitializer();
      const assigned = decl && !init ? showAssignment(decl) : undefined;
      if (assigned) {
        base = assigned.base.getText();
        showLocals.set(decl, assigned);
      } else if (
        init &&
        Node.isNewExpression(init) &&
        init.getExpression().getText() === 'Show' &&
        init.getArguments().length === 1
      ) {
        base = recv.getText();
        newShows.add(decl);
      } else {
        continue;
      }
    }
    const result = rewrite(method.getName(), call.getArguments(), base);
    if (!result) continue;
    const [rule, text] = result;
    plan.push({ node: call, rule, apply: () => call.replaceWithText(text) });
  }

  for (const decl of newShows) {
    const init = decl.getInitializer();
    const checkout = init.getArguments()[0].getText();
    plan.push({
      node: decl,
      rule: 'new Show',
      apply: () =>
        init.replaceWithText(`Workspace.over(${checkout}, SYSTEM_ACTOR)`),
    });
  }

  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (prop.getName() !== 'showCmd') continue;
    const object = prop.getInitializer();
    if (!Node.isObjectLiteralExpression(object)) continue;
    const groups = new Map();
    const add = (owner, text) => {
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(text);
    };
    let spread = false;
    let known = true;
    for (const member of object.getProperties()) {
      if (Node.isSpreadAssignment(member)) {
        if (member.getExpression().getText() !== 'overrides.showCmd') {
          known = false;
        }
        spread = true;
      } else if (Node.isPropertyAssignment(member)) {
        const target = MOCKED.get(member.getName());
        if (target) {
          add(target[0], `${target[1]}: ${member.getInitializer().getText()}`);
        } else if (member.getName() !== 'showFileNames') {
          known = false;
        }
      } else {
        known = false;
      }
    }
    if (!known) continue;
    if (spread) {
      for (const owner of ['settings', 'resources']) {
        add(owner, `...overrides.${owner}`);
      }
    }
    const text = [...groups]
      .map(([owner, members]) => `${owner}: {\n${members.join(',\n')},\n}`)
      .join(',\n');
    plan.push({
      node: prop,
      rule: 'mock',
      apply: () => prop.replaceWithText(text),
    });
  }

  // Deepest first, so an edit never invalidates a node edited after it.
  plan.sort((a, b) => b.node.getStart() - a.node.getStart());
  for (const entry of plan) note(entry.node, entry.rule);
  for (const entry of plan) entry.apply();

  for (const [decl, { statement }] of showLocals) {
    const symbol = decl.getNameNode().getSymbol();
    const uses = file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((id) => id !== decl.getNameNode() && id.getSymbol() === symbol);
    // Only the assignment's own reference is left.
    if (uses.length !== 1) continue;
    note(statement, 'local');
    statement.remove();
    const declStatement = decl.getVariableStatement();
    if (declStatement.getDeclarations().length === 1) declStatement.remove();
    else decl.remove();
  }

  if (showLocals.size > 0 || newShows.size > 0) {
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
