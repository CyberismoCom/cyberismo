/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A12 call-site codemod: tests write cards through the handle's `cards`
 * façade, or through the free functions in src/cards, instead of the legacy
 * command proxies and Checkout methods. Call sites only; no assertion is
 * touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a12-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules (test files of data-handler, backend, mcp and cli):
 *   cards  `<h>.editCmd.editCardContent(...)` -> `<h>.cards.edit(...)`, with
 *          editCardMetadata -> editField, transitionCmd.cardTransition ->
 *          transition, createCmd.createLabel -> addLabel, createLink ->
 *          addLink, createAttachment -> addAttachment, and
 *          removeCmd.remove('card'|'label'|'link'|'attachment', ...) ->
 *          cards.remove | removeLabel | removeLink | removeAttachment.
 *          The receiver may be a local alias of the proxy
 *          (`const create = ws.createCmd`); the handle expression is then
 *          taken from the alias's initialiser or assignment, and an alias
 *          left unused is removed.
 *   free   `<checkout>.m(...)` -> `m(<checkout>, ...)` for the card writes
 *          that left Checkout (updateCardContent, updateCardMetadataKey,
 *          updateCardMetadata, deleteCards, handleCardDeleted,
 *          performTransition, executeSideEffects, runCreationSideEffects,
 *          createCardAttachment, removeCardAttachment, renameCardAttachment),
 *          importing m from src/cards/<file>.js.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const CARDS_SRC = path.join(ROOT, 'tools', 'data-handler', 'src', 'cards');

// proxy -> method -> façade method
const PROXY_RULES = {
  editCmd: { editCardContent: 'edit', editCardMetadata: 'editField' },
  transitionCmd: { cardTransition: 'transition' },
  createCmd: {
    createLabel: 'addLabel',
    createLink: 'addLink',
    createAttachment: 'addAttachment',
  },
};
const REMOVE_RULES = {
  card: 'remove',
  label: 'removeLabel',
  link: 'removeLink',
  attachment: 'removeAttachment',
};
const FREE = {
  updateCardContent: 'update',
  updateCardMetadataKey: 'update',
  updateCardMetadata: 'update',
  deleteCards: 'delete',
  handleCardDeleted: 'delete',
  performTransition: 'transition',
  executeSideEffects: 'transition',
  runCreationSideEffects: 'transition',
  createCardAttachment: 'attachments',
  removeCardAttachment: 'attachments',
  renameCardAttachment: 'attachments',
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
const where = (node) =>
  `${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}`;

// The proxy a receiver stands for: { owner: handle expression, proxy: name }.
function resolveProxy(recv, file) {
  if (Node.isPropertyAccessExpression(recv)) {
    const proxy = recv.getName();
    if (/^(edit|remove|transition|create)Cmd$/.test(proxy)) {
      return { owner: recv.getExpression().getText(), proxy, alias: undefined };
    }
    return undefined;
  }
  if (!Node.isIdentifier(recv)) return undefined;
  const name = recv.getText();
  const symbol = recv.getSymbol();
  if (!symbol) return undefined;
  const sources = [];
  for (const decl of symbol.getDeclarations()) {
    if (Node.isVariableDeclaration(decl) && decl.getInitializer()) {
      sources.push(decl.getInitializer());
    }
  }
  for (const bin of file.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    const left = bin.getLeft();
    if (
      bin.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      Node.isIdentifier(left) &&
      left.getText() === name &&
      left.getSymbol() === symbol
    ) {
      sources.push(bin.getRight());
    }
  }
  const resolved = sources
    .filter(
      (s) =>
        Node.isPropertyAccessExpression(s) &&
        /^(edit|remove|transition|create)Cmd$/.test(s.getName()),
    )
    .map((s) => ({
      owner: s.getExpression().getText(),
      proxy: s.getName(),
      alias: symbol
        .getDeclarations()
        .filter((d) => Node.isVariableDeclaration(d)),
    }));
  if (resolved.length === 0) return undefined;
  const first = resolved[0];
  if (
    resolved.some((r) => r.owner !== first.owner || r.proxy !== first.proxy)
  ) {
    throw new Error(`${where(recv)}: alias '${name}' has several owners`);
  }
  return first;
}

const aliases = new Map(); // alias declarations whose use was re-pointed
const imports = new Map(); // file -> Map(module -> Set(name))

for (const file of morph.getSourceFiles()) {
  const calls = file.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    if (call.wasForgotten()) continue;
    const method = call.getExpression();
    if (!Node.isPropertyAccessExpression(method)) continue;
    const name = method.getName();
    const recv = method.getExpression();

    // cards: proxy methods
    const proxy = resolveProxy(recv, file);
    if (proxy) {
      let renamed;
      if (proxy.proxy === 'removeCmd' && name === 'remove') {
        const first = call.getArguments()[0];
        if (!first || !Node.isStringLiteral(first)) continue;
        renamed = Object.hasOwn(REMOVE_RULES, first.getLiteralValue())
          ? REMOVE_RULES[first.getLiteralValue()]
          : undefined;
        if (!renamed) continue;
        first.getParentOrThrow(); // the type argument goes away
        const rest = call
          .getArguments()
          .slice(1)
          .map((a) => a.getText());
        note(call, 'cards');
        call.replaceWithText(
          `${proxy.owner}.cards.${renamed}(${rest.join(', ')})`,
        );
      } else if (Object.hasOwn(PROXY_RULES[proxy.proxy] ?? {}, name)) {
        renamed = PROXY_RULES[proxy.proxy][name];
        note(call, 'cards');
        method.replaceWithText(`${proxy.owner}.cards.${renamed}`);
      } else {
        continue;
      }
      for (const decl of proxy.alias ?? []) aliases.set(decl, decl);
      continue;
    }

    // free: Checkout card writes
    const mod = Object.hasOwn(FREE, name) ? FREE[name] : undefined;
    if (mod) {
      if (
        !file
          .getFilePath()
          .includes(`${path.sep}data-handler${path.sep}test${path.sep}`)
      ) {
        throw new Error(`${where(call)}: no import path for ${name}`);
      }
      note(call, 'free');
      const args = call.getArguments().map((a) => a.getText());
      call.replaceWithText(`${name}(${[recv.getText(), ...args].join(', ')})`);
      if (!imports.has(file)) imports.set(file, new Map());
      const byMod = imports.get(file);
      if (!byMod.has(mod)) byMod.set(mod, new Set());
      byMod.get(mod).add(name);
    }
  }
}

// Aliases that no longer have a use: a declaration whose name is mentioned
// nowhere else in its block.
for (const decl of aliases.values()) {
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

for (const [file, byMod] of imports) {
  for (const [mod, names] of byMod) {
    const spec = path
      .relative(
        path.dirname(file.getFilePath()),
        path.join(CARDS_SRC, `${mod}.js`),
      )
      .split(path.sep)
      .join('/');
    const existing = file.getImportDeclaration(
      (d) => d.getModuleSpecifierValue() === spec,
    );
    if (existing) {
      const have = new Set(existing.getNamedImports().map((n) => n.getName()));
      for (const n of [...names].sort())
        if (!have.has(n)) existing.addNamedImport(n);
    } else {
      const imps = file.getImportDeclarations();
      file.insertImportDeclaration(imps.length, {
        moduleSpecifier: spec.startsWith('.') ? spec : `./${spec}`,
        namedImports: [...names].sort(),
      });
    }
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.log(`${edits.length} sites`);
