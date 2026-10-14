/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A33 call-site codemod: data-handler tests stop reading the handle's
 * public `checkout` and read it through `checkoutOf(ws)` from
 * src/infra/internal.ts, which this script writes. The Workspace
 * constructor records its checkout there. Call sites only; the field goes
 * private by hand.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a33-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules:
 *   internal  writes tools/data-handler/src/infra/internal.ts.
 *   record    the Workspace constructor calls `setCheckout(this, checkout)`.
 *   read      in tools/data-handler/test, `e.checkout` where `e` is a
 *             Workspace -> `checkoutOf(e)`, importing `checkoutOf` from
 *             the file's relative path to src/infra/internal.js.
 * Any other access to a Workspace's `checkout` in the tests (optional
 * chaining, destructuring, element access) stops the run.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const DH = path.join(ROOT, 'tools', 'data-handler');
const INTERNAL = path.join(DH, 'src', 'infra', 'internal.ts');
const WORKSPACE = path.join(DH, 'src', 'workspace', 'workspace.ts');
const TEST = path.join(DH, 'test') + path.sep;

const INTERNAL_SOURCE = `/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Checkout } from './checkout.js';

// Keyed by the Workspace handle. infra/ may not import workspace/, so the
// key type is \`object\`.
const checkouts = new WeakMap<object, Checkout>();

/** Records the checkout a workspace handle works on. */
export function setCheckout(ws: object, checkout: Checkout): void {
  checkouts.set(ws, checkout);
}

/**
 * The checkout a workspace handle works on. Internal to data-handler: not
 * exported from the package.
 */
export function checkoutOf(ws: object): Checkout {
  const checkout = checkouts.get(ws);
  if (!checkout) {
    throw new Error('Not a workspace handle');
  }
  return checkout;
}
`;

const edits = [];
const note = (file, line, rule) =>
  edits.push(`${path.relative(ROOT, file)}:${line} ${rule}`);

if (
  !fs.existsSync(INTERNAL) ||
  fs.readFileSync(INTERNAL, 'utf8') !== INTERNAL_SOURCE
) {
  fs.writeFileSync(INTERNAL, INTERNAL_SOURCE);
  note(INTERNAL, 1, 'internal');
}

const morph = new MorphProject({
  tsConfigFilePath: path.join(DH, 'tsconfig.json'),
});

function relativeTo(file, target) {
  const relative = path
    .relative(path.dirname(file.getFilePath()), target)
    .replaceAll(path.sep, '/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function importName(file, name, target) {
  const specifier = relativeTo(file, target);
  const decl = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === specifier && !d.isTypeOnly());
  if (decl) {
    if (!decl.getNamedImports().some((n) => n.getName() === name)) {
      decl.addNamedImport(name);
    }
    return;
  }
  const imports = file.getImportDeclarations();
  file.insertImportDeclaration(imports.length, {
    namedImports: [name],
    moduleSpecifier: specifier,
  });
}

// record
const workspace = morph.getSourceFileOrThrow(WORKSPACE);
const ctor = workspace.getClassOrThrow('Workspace').getConstructors()[0];
if (!ctor.getBodyText().includes('setCheckout(this, checkout)')) {
  ctor.addStatements('setCheckout(this, checkout);');
  importName(workspace, 'setCheckout', INTERNAL.replace(/\.ts$/, '.js'));
  note(WORKSPACE, ctor.getStartLineNumber(), 'record');
}

const isWorkspace = (node) => {
  const symbol = node.getType().getSymbol();
  if (!symbol || symbol.getName() !== 'Workspace') return false;
  return symbol
    .getDeclarations()
    .some((d) => d.getSourceFile().getFilePath() === WORKSPACE);
};

// read
for (const file of morph.getSourceFiles()) {
  if (!file.getFilePath().startsWith(TEST)) continue;
  const unhandled = [];
  for (const node of file.getDescendants()) {
    if (Node.isElementAccessExpression(node)) {
      const arg = node.getArgumentExpression();
      if (
        arg &&
        arg.getText().replace(/['"`]/g, '') === 'checkout' &&
        isWorkspace(node.getExpression())
      ) {
        unhandled.push(node);
      }
    }
    if (Node.isBindingElement(node)) {
      const name = node.getPropertyNameNode()?.getText() ?? node.getName();
      const pattern = node.getParent();
      const owner = pattern.getParent();
      if (
        name === 'checkout' &&
        Node.isVariableDeclaration(owner) &&
        owner.getInitializer() &&
        isWorkspace(owner.getInitializer())
      ) {
        unhandled.push(node);
      }
    }
  }
  const reads = file
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter(
      (p) => p.getName() === 'checkout' && isWorkspace(p.getExpression()),
    );
  for (const read of reads) {
    if (read.hasQuestionDotToken()) unhandled.push(read);
  }
  if (unhandled.length > 0) {
    for (const node of unhandled) {
      console.error(
        `${path.relative(ROOT, file.getFilePath())}:${node.getStartLineNumber()} unhandled: ${node.getText()}`,
      );
    }
    process.exit(1);
  }
  if (reads.length === 0) continue;
  // Innermost first, so an outer replacement keeps the inner one's text.
  const sites = reads
    .map((read) => ({ read, line: read.getStartLineNumber() }))
    .sort((a, b) => b.read.getStart() - a.read.getStart());
  for (const { read, line } of sites) {
    read.replaceWithText(`checkoutOf(${read.getExpression().getText()})`);
    note(file.getFilePath(), line, 'read');
  }
  importName(file, 'checkoutOf', INTERNAL.replace(/\.ts$/, '.js'));
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.error(`${edits.length} edits`);
