/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A13 call-site codemod: tests read and create cards through the handle's
 * `cards` façade, or through the free functions in src/cards, instead of the
 * legacy command proxies, Show instances and Checkout methods. Call sites
 * only; no assertion is touched.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a13-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules (test files of data-handler, backend, mcp and cli):
 *   cards  `<h>.createCmd.createCard(...)` -> `<h>.cards.create(...)`,
 *          addCards -> addToTemplate; `<h>.showCmd.showCardDetails(...)` ->
 *          `<h>.cards.details(...)`, showCards -> list, showProjectCards ->
 *          roots, showAllTemplateCards -> templateCards, showAttachments ->
 *          attachments, showAttachment -> attachment, showLabels -> labels,
 *          showCardLogicProgram -> logicProgram. The receiver may be a local
 *          alias of the proxy; the handle expression is then taken from the
 *          alias's initialiser or assignment, and an alias left unused is
 *          removed.
 *   show   `new Show(<checkout>).showCardDetails(...)` (also through a local
 *          alias) -> `new Cards(<checkout>, SYSTEM_ACTOR, undefined).details(...)`;
 *          a Show import left unused is removed, or made type-only.
 *   free   `<checkout>.m(...)` -> `m(<checkout>, ...)` for the Checkout card
 *          reads that left it (findCard, hasCard, cardNode, cardContent,
 *          cardAttachments, cardKeysToCards as cardsByKeys, listCards,
 *          listCardIds, allTemplateCards), importing m from src/cards/read.js.
 *          Only receivers typed Checkout are touched. A file that declares a
 *          local of the same name imports the function as `read<Name>`.
 *   mock   an object literal standing in for a handle, `{ showCmd: { showLabels,
 *          ... }, createCmd: { createCard, ... } }`: the properties named for
 *          a method that moved to `cards` move to a sibling `cards` property,
 *          renamed; a `...x.showCmd` spread in the proxy literal gets a
 *          `...x.cards` spread in `cards`.
 *   import `containers/project/template-instantiation.js` ->
 *          `cards/instantiate.js`.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const PACKAGES = ['data-handler', 'backend', 'mcp', 'cli'];
const SRC = path.join(ROOT, 'tools', 'data-handler', 'src');
const READ_MODULE = path.join(SRC, 'cards', 'read.js');
const CARDS_MODULE = path.join(SRC, 'cards', 'cards.js');
const ACTOR_MODULE = path.join(SRC, 'utils', 'tx-record.js');
const OLD_INSTANTIATION = path.join(
  SRC,
  'containers',
  'project',
  'template-instantiation.js',
);
const NEW_INSTANTIATION = path.join(SRC, 'cards', 'instantiate.js');

// proxy -> method -> façade method
const PROXY_RULES = {
  createCmd: { createCard: 'create', addCards: 'addToTemplate' },
  showCmd: {
    showCardDetails: 'details',
    showCards: 'list',
    showProjectCards: 'roots',
    showAllTemplateCards: 'templateCards',
    showAttachments: 'attachments',
    showAttachment: 'attachment',
    showLabels: 'labels',
    showCardLogicProgram: 'logicProgram',
  },
};
// Checkout method -> free function in src/cards/read.ts
const FREE = {
  findCard: 'findCard',
  hasCard: 'hasCard',
  cardNode: 'cardNode',
  cardContent: 'cardContent',
  cardAttachments: 'cardAttachments',
  cardKeysToCards: 'cardsByKeys',
  listCards: 'listCards',
  listCardIds: 'listCardIds',
  allTemplateCards: 'allTemplateCards',
};
const PROXY_NAME = /^(create|show)Cmd$/;

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

// Where an identifier's value comes from: its initialisers and assignments.
function sourcesOf(recv, file) {
  const symbol = recv.getSymbol();
  if (!symbol) return { symbol, sources: [] };
  const name = recv.getText();
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
  return { symbol, sources };
}

function singleOwner(recv, resolved, symbol) {
  if (resolved.length === 0) return undefined;
  const first = resolved[0];
  if (
    resolved.some((r) => r.owner !== first.owner || r.proxy !== first.proxy)
  ) {
    throw new Error(
      `${where(recv)}: alias '${recv.getText()}' has several owners`,
    );
  }
  return {
    ...first,
    alias: symbol
      .getDeclarations()
      .filter((d) => Node.isVariableDeclaration(d)),
  };
}

// The proxy a receiver stands for: { owner: handle expression, proxy: name }.
function resolveProxy(recv, file) {
  if (Node.isPropertyAccessExpression(recv)) {
    const proxy = recv.getName();
    if (PROXY_NAME.test(proxy)) {
      return { owner: recv.getExpression().getText(), proxy, alias: undefined };
    }
    return undefined;
  }
  if (!Node.isIdentifier(recv)) return undefined;
  const { symbol, sources } = sourcesOf(recv, file);
  if (!symbol) return undefined;
  const resolved = sources
    .filter(
      (s) => Node.isPropertyAccessExpression(s) && PROXY_NAME.test(s.getName()),
    )
    .map((s) => ({ owner: s.getExpression().getText(), proxy: s.getName() }));
  return singleOwner(recv, resolved, symbol);
}

// The checkout of a `new Show(<checkout>)` a receiver stands for.
function resolveShowInstance(recv, file) {
  const isNewShow = (n) =>
    Node.isNewExpression(n) &&
    n.getExpression().getText() === 'Show' &&
    n.getArguments().length === 1;
  if (isNewShow(recv)) {
    return {
      owner: recv.getArguments()[0].getText(),
      proxy: 'new Show',
      alias: undefined,
    };
  }
  if (!Node.isIdentifier(recv)) return undefined;
  const { symbol, sources } = sourcesOf(recv, file);
  if (!symbol) return undefined;
  const resolved = sources
    .filter(isNewShow)
    .map((s) => ({ owner: s.getArguments()[0].getText(), proxy: 'new Show' }));
  return singleOwner(recv, resolved, symbol);
}

const isCheckout = (recv) => {
  const type = recv.getType();
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  return symbol?.getName() === 'Checkout';
};

// Decide every edit first, apply them last-to-first so a nested site is
// edited before the call that contains it.
const plans = new Map(); // file -> [{ call, apply }]
const aliases = new Map(); // alias declarations whose use was re-pointed
const imports = new Map(); // file -> Map(module path -> Set(name))
const showFiles = new Set(); // files whose Show import may now be unused
const addImport = (file, mod, name, local = name) => {
  if (!imports.has(file)) imports.set(file, new Map());
  const byMod = imports.get(file);
  if (!byMod.has(mod)) byMod.set(mod, new Map());
  byMod.get(mod).set(name, local);
};
// Whether the file declares a local called `name`.
const declaresLocal = (file, name) =>
  file.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => {
    if (id.getText() !== name) return false;
    const parent = id.getParent();
    return (
      (Node.isVariableDeclaration(parent) ||
        Node.isParameterDeclaration(parent) ||
        Node.isBindingElement(parent) ||
        Node.isFunctionDeclaration(parent)) &&
      parent.getNameNode() === id
    );
  });

for (const file of morph.getSourceFiles()) {
  const plan = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const method = call.getExpression();
    if (!Node.isPropertyAccessExpression(method)) continue;
    const name = method.getName();
    const recv = method.getExpression();

    const proxy = resolveProxy(recv, file);
    if (proxy && Object.hasOwn(PROXY_RULES[proxy.proxy] ?? {}, name)) {
      const renamed = PROXY_RULES[proxy.proxy][name];
      plan.push({
        call,
        rule: 'cards',
        apply: () => method.replaceWithText(`${proxy.owner}.cards.${renamed}`),
      });
      for (const decl of proxy.alias ?? []) aliases.set(decl, decl);
      continue;
    }

    const show = resolveShowInstance(recv, file);
    if (show && Object.hasOwn(PROXY_RULES.showCmd, name)) {
      const renamed = PROXY_RULES.showCmd[name];
      plan.push({
        call,
        rule: 'show',
        apply: () =>
          method.replaceWithText(
            `new Cards(${show.owner}, SYSTEM_ACTOR, undefined).${renamed}`,
          ),
      });
      addImport(file, CARDS_MODULE, 'Cards');
      addImport(file, ACTOR_MODULE, 'SYSTEM_ACTOR');
      showFiles.add(file);
      for (const decl of show.alias ?? []) aliases.set(decl, decl);
      continue;
    }

    if (Object.hasOwn(FREE, name) && isCheckout(recv)) {
      const fn = FREE[name];
      const local = declaresLocal(file, fn)
        ? `read${fn[0].toUpperCase()}${fn.slice(1)}`
        : fn;
      plan.push({
        call,
        rule: 'free',
        apply: () => {
          const args = call.getArguments().map((a) => a.getText());
          call.replaceWithText(
            `${local}(${[recv.getText(), ...args].join(', ')})`,
          );
        },
      });
      addImport(file, READ_MODULE, fn, local);
    }
  }
  if (plan.length > 0) plans.set(file, plan);
}

for (const [file, plan] of plans) {
  for (const entry of plan) note(entry.call, entry.rule);
  for (const entry of plan.toReversed()) entry.apply();
}

// Aliases that no longer have a use: a declaration whose name is mentioned
// nowhere else in its block.
for (const decl of aliases.values()) {
  if (decl.wasForgotten()) continue;
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
      .relative(path.dirname(file.getFilePath()), mod)
      .split(path.sep)
      .join('/');
    const existing = file.getImportDeclaration(
      (d) => d.getModuleSpecifierValue() === spec,
    );
    const named = [...names.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([imported, local]) =>
        imported === local ? imported : { name: imported, alias: local },
      );
    if (existing) {
      const have = new Set(
        existing
          .getNamedImports()
          .map((n) => n.getAliasNode()?.getText() ?? n.getName()),
      );
      for (const n of named) {
        if (!have.has(typeof n === 'string' ? n : n.alias))
          existing.addNamedImport(n);
      }
    } else {
      const imps = file.getImportDeclarations();
      file.insertImportDeclaration(imps.length, {
        moduleSpecifier: spec.startsWith('.') ? spec : `./${spec}`,
        namedImports: named,
      });
    }
  }
}

// A Show import nothing mentions any more.
for (const file of showFiles) {
  for (const decl of file.getImportDeclarations()) {
    for (const named of decl.getNamedImports()) {
      if (named.getName() !== 'Show') continue;
      const others = file
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter(
          (id) =>
            id.getText() === 'Show' &&
            !(id.getStart() >= decl.getStart() && id.getEnd() <= decl.getEnd()),
        );
      if (others.length > 0) {
        // Only the type is left: lint wants a type import.
        const typeOnly = others.every((id) =>
          Node.isTypeReference(id.getParent()),
        );
        if (
          typeOnly &&
          !decl.isTypeOnly() &&
          decl.getNamedImports().length === 1
        ) {
          note(decl, 'Show import made type-only');
          decl.setIsTypeOnly(true);
        }
        continue;
      }
      note(decl, 'unused Show import removed');
      named.remove();
      if (decl.getNamedImports().length === 0 && !decl.getDefaultImport()) {
        decl.remove();
      }
    }
  }
}

// Mock handles: card methods move from a proxy literal to a `cards` literal.
for (const file of morph.getSourceFiles()) {
  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (prop.wasForgotten()) continue;
    const proxy = prop.getName();
    const rules = Object.hasOwn(PROXY_RULES, proxy)
      ? PROXY_RULES[proxy]
      : undefined;
    const lit = prop.getInitializer();
    const parent = prop.getParent();
    if (!rules || !Node.isObjectLiteralExpression(lit)) continue;
    if (!Node.isObjectLiteralExpression(parent)) continue;
    const moved = lit
      .getProperties()
      .filter((p) => Object.hasOwn(rules, p.getSymbol()?.getName() ?? ''));
    if (moved.length === 0) continue;
    const entries = moved.map((p) => {
      if (!Node.isPropertyAssignment(p)) {
        throw new Error(`${where(p)}: cannot move a ${p.getKindName()}`);
      }
      return `${rules[p.getName()]}: ${p.getInitializer().getText()}`;
    });
    for (const p of lit.getProperties()) {
      if (
        Node.isSpreadAssignment(p) &&
        p.getExpression().getText().endsWith(`.${proxy}`)
      ) {
        const owner = p.getExpression().getText().slice(0, -`.${proxy}`.length);
        entries.push(`...${owner}.cards`);
      }
    }
    note(prop, 'mock');
    for (const p of moved) p.remove();
    const existing = parent.getProperty('cards');
    if (existing && Node.isPropertyAssignment(existing)) {
      const cardsLit = existing.getInitializer();
      for (const entry of entries) cardsLit.addProperty(entry);
    } else {
      parent.insertProperty(
        parent.getProperties().indexOf(prop) + 1,
        `cards: { ${entries.join(', ')} }`,
      );
    }
  }
}

// The template instantiation module moved.
for (const file of morph.getSourceFiles()) {
  for (const decl of file.getImportDeclarations()) {
    const spec = decl.getModuleSpecifierValue();
    if (!spec.startsWith('.')) continue;
    const abs = path.resolve(path.dirname(file.getFilePath()), spec);
    if (abs !== OLD_INSTANTIATION) continue;
    let rel = path
      .relative(path.dirname(file.getFilePath()), NEW_INSTANTIATION)
      .split(path.sep)
      .join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    note(decl, 'import');
    decl.setModuleSpecifier(rel);
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.log(`${edits.length} sites`);
