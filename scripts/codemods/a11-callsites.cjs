/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A11 call-site codemod: tests move and rank cards through the handle's
 * `cards` façade instead of the legacy `moveCmd` proxy. Call sites only; no
 * assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a11-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rule (test files of data-handler, backend, mcp and cli):
 *   cards  `x.moveCmd.m(...)` -> `x.cards.n(...)`, with m -> n:
 *          moveCard -> move, rankCard -> rank, rankByIndex -> rankAt,
 *          rankFirst -> rankFirst, rebalanceChildren -> rebalance,
 *          rebalanceProject -> rebalanceAll.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];

const RENAMES = {
  moveCard: 'move',
  rankCard: 'rank',
  rankByIndex: 'rankAt',
  rankFirst: 'rankFirst',
  rebalanceChildren: 'rebalance',
  rebalanceProject: 'rebalanceAll',
};

const morph = new MorphProject({ skipAddingFilesFromTsConfig: true });
for (const pkg of PACKAGES) {
  morph.addSourceFilesAtPaths(path.join(ROOT, 'tools', pkg, 'test/**/*.ts'));
}

const edits = [];
const note = (node, rule) =>
  edits.push(
    `${path.relative(ROOT, node.getSourceFile().getFilePath())}:${node.getStartLineNumber()} ${rule}`,
  );

for (const file of morph.getSourceFiles()) {
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) continue;
    const method = call.getExpression();
    if (!Node.isPropertyAccessExpression(method)) continue;
    const proxy = method.getExpression();
    if (
      !Node.isPropertyAccessExpression(proxy) ||
      proxy.getName() !== 'moveCmd'
    ) {
      continue;
    }
    const renamed = RENAMES[method.getName()];
    if (!renamed) {
      throw new Error(
        `${file.getFilePath()}:${call.getStartLineNumber()}: no rule for moveCmd.${method.getName()}`,
      );
    }
    note(call, 'cards');
    method.getNameNode().replaceWithText(renamed);
    proxy.getNameNode().replaceWithText('cards');
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.log(`${edits.length} sites`);
