/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * A31 call-site codemod: the CLI's command option types leave
 * @cyberismo/data-handler for tools/cli/src/options.ts, typed per command;
 * the CLI's lib/dispatch.ts becomes lib/program.ts; the handle's legacy
 * command getters go, so their callers create the command where they use
 * it; and command-handler.ts no longer re-exports Workspace. Call sites
 * only.
 *
 * ts-morph is not a repo dependency. Install it outside the repo:
 *   pnpm add --dir ~/cyberismo/.codemod-tools ts-morph@28.0.0
 * Run with the repo root as the target (default: this script's repo):
 *   NODE_PATH=~/cyberismo/.codemod-tools/node_modules \
 *     node a31-callsites.cjs <repo root>
 * Then format tools/:
 *   ./node_modules/.bin/prettier --write tools
 *
 * Re-running on already converted code is a no-op. Every edited site is
 * printed as `file:line rule`.
 *
 * Rules, tools/cli/src and tools/cli/test:
 *   opts     `CommandOptions<'k'>` -> the command's own type, e.g.
 *            `CommandOptions<'move'>` -> `MoveCommandOptions`.
 *   import   option types (`*CommandOptions`) imported from
 *            '@cyberismo/data-handler' -> a type import from options.js;
 *            the data-handler import is dropped once it is empty.
 *   program  a module specifier ending in `dispatch.js` -> `program.js`.
 * Rules, tools/<pkg>/src and tools/<pkg>/test (but the files in SKIP):
 *   legacy   `h.importCmd` / `h.renameCmd` / `h.removeCmd` -> `new
 *            Import(h.checkout, h.actor, h.identity)` (Rename, Remove
 *            alike); `h.validateCmd` -> `Validate.getInstance()`; the
 *            class imported from '@cyberismo/data-handler' outside
 *            data-handler, else from its commands/ file.
 *   handle   `Workspace` imported from '…/command-handler.js' -> from
 *            '…/workspace/workspace.js'.
 */
'use strict';

const path = require('node:path');
const { Project: MorphProject, SyntaxKind, Node } = require('ts-morph');

const ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..'));
const CLI = path.join(ROOT, 'tools', 'cli');
const OPTIONS = path.join(CLI, 'src', 'options.js');

const DH_SRC = path.join(ROOT, 'tools', 'data-handler', 'src');
// The dispatcher goes by hand; so does the test of the shared getters.
const SKIP = [
  'src/command-handler.ts',
  'src/workspace/shared-commands.ts',
  'test/workspace/handle.test.ts',
].map((file) => path.join(ROOT, 'tools', 'data-handler', file));

const morph = new MorphProject({ skipAddingFilesFromTsConfig: true });
for (const pkg of ['backend', 'cli', 'data-handler', 'mcp']) {
  for (const dir of ['src', 'test']) {
    morph.addSourceFilesAtPaths(path.join(ROOT, 'tools', pkg, dir, '**/*.ts'));
  }
}
const inCli = (file) => file.getFilePath().startsWith(CLI + path.sep);

const edits = [];
const note = (node, rule) =>
  edits.push(
    `${path.relative(ROOT, node.getSourceFile().getFilePath())}:${node.getStartLineNumber()} ${rule}`,
  );

const typeName = (key) =>
  `${key[0].toUpperCase()}${key.slice(1)}CommandOptions`;
const isOptionType = (name) => /CommandOptions$/.test(name);

function optionsSpecifier(file) {
  const relative = path
    .relative(path.dirname(file.getFilePath()), OPTIONS)
    .replaceAll(path.sep, '/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

const LEGACY = {
  importCmd: ['Import', 'import.js'],
  renameCmd: ['Rename', 'rename.js'],
  removeCmd: ['Remove', 'remove.js'],
  validateCmd: ['Validate', 'validate.js'],
};

function relativeTo(file, target) {
  const relative = path
    .relative(path.dirname(file.getFilePath()), target)
    .replaceAll(path.sep, '/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

// Imports `name` into `file`: from the package outside data-handler, else
// from data-handler's own `src/<dir>/<base>`.
function importClass(file, name, dir, base) {
  const inDataHandler = file
    .getFilePath()
    .startsWith(path.join(ROOT, 'tools', 'data-handler') + path.sep);
  const specifier = inDataHandler
    ? relativeTo(file, path.join(DH_SRC, dir, base))
    : '@cyberismo/data-handler';
  const decls = file
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === specifier);
  for (const decl of decls) {
    const named = decl.getNamedImports().find((n) => n.getName() === name);
    if (named) {
      if (named.isTypeOnly()) named.setIsTypeOnly(false);
      if (decl.isTypeOnly()) decl.setIsTypeOnly(false);
      return;
    }
  }
  const value = decls.find((d) => !d.isTypeOnly());
  if (value) {
    value.addNamedImport(name);
  } else {
    file.addImportDeclaration({
      moduleSpecifier: specifier,
      namedImports: [name],
    });
  }
}

for (const file of morph.getSourceFiles()) {
  // legacy
  if (!SKIP.includes(path.resolve(file.getFilePath()))) {
    const used = new Set();
    for (const access of file.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      if (access.wasForgotten() || !Object.hasOwn(LEGACY, access.getName()))
        continue;
      const handle = access.getExpression();
      if (!Node.isIdentifier(handle)) {
        throw new Error(`${file.getFilePath()}: ${access.getText()}`);
      }
      const h = handle.getText();
      const [name] = LEGACY[access.getName()];
      note(access, 'legacy');
      used.add(name);
      access.replaceWithText(
        name === 'Validate'
          ? 'Validate.getInstance()'
          : `new ${name}(${h}.checkout, ${h}.actor, ${h}.identity)`,
      );
    }
    for (const name of used) {
      const base = Object.values(LEGACY).find(([n]) => n === name)[1];
      importClass(file, name, 'commands', base);
    }
  }

  // handle
  for (const decl of file.getImportDeclarations()) {
    if (!decl.getModuleSpecifierValue().endsWith('/command-handler.js'))
      continue;
    const names = decl.getNamedImports().map((n) => n.getName());
    if (names.length !== 1 || names[0] !== 'Workspace') continue;
    note(decl, 'handle');
    decl.setModuleSpecifier(
      relativeTo(file, path.join(DH_SRC, 'workspace', 'workspace.js')),
    );
  }

  if (!inCli(file)) continue;

  // opts
  for (const ref of file.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    if (ref.wasForgotten() || ref.getTypeName().getText() !== 'CommandOptions')
      continue;
    const [arg] = ref.getTypeArguments();
    if (
      !arg ||
      !Node.isLiteralTypeNode(arg) ||
      !Node.isStringLiteral(arg.getLiteral())
    ) {
      throw new Error(`${file.getFilePath()}: unexpected ${ref.getText()}`);
    }
    note(ref, 'opts');
    ref.replaceWithText(typeName(arg.getLiteral().getLiteralValue()));
  }

  // import
  const dataHandler = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === '@cyberismo/data-handler');
  const moved = (dataHandler?.getNamedImports() ?? []).filter((n) =>
    isOptionType(n.getName()),
  );
  if (moved.length) {
    note(dataHandler, 'import');
    const names = new Set(moved.map((n) => n.getName()));
    names.delete('CommandOptions');
    for (const ref of file.getDescendantsOfKind(SyntaxKind.TypeReference)) {
      const name = ref.getTypeName().getText();
      if (isOptionType(name)) names.add(name);
    }
    moved.forEach((n) => n.remove());
    if (
      dataHandler.getNamedImports().length === 0 &&
      !dataHandler.getDefaultImport() &&
      !dataHandler.getNamespaceImport()
    ) {
      dataHandler.remove();
    }
    if (names.size) {
      file.addImportDeclaration({
        moduleSpecifier: optionsSpecifier(file),
        namedImports: [...names].sort(),
        isTypeOnly: true,
      });
    }
  }

  // program
  for (const decl of [
    ...file.getImportDeclarations(),
    ...file.getExportDeclarations(),
  ]) {
    const specifier = decl.getModuleSpecifierValue();
    if (specifier?.endsWith('/dispatch.js')) {
      note(decl, 'program');
      decl.setModuleSpecifier(specifier.replace(/dispatch\.js$/, 'program.js'));
    }
  }
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const [arg] = call.getArguments();
    if (
      call.getExpression().getText() === 'vi.mock' &&
      arg &&
      Node.isStringLiteral(arg) &&
      arg.getLiteralValue().endsWith('/dispatch.js')
    ) {
      note(call, 'program');
      arg.setLiteralValue(
        arg.getLiteralValue().replace(/dispatch\.js$/, 'program.js'),
      );
    }
  }
}

morph.saveSync();
for (const edit of edits) console.log(edit);
console.error(`${edits.length} edits`);
