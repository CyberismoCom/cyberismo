// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Builds the single binary: `bun src/build.ts [outfile]`. Run `pnpm build`
// first; the bundle is made from the packages' dist output.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { BunPlugin } from 'bun';

await import('./gen-assets.js');

const createRequireDecl = 'const require = createRequire(import.meta.url);';

// `createRequire(import.meta.url)` hides require() calls from the bundler, so
// their targets are not embedded. Dropping the declaration leaves plain
// require() calls that Bun bundles statically (css-tree's JSON data).
const inlineCreateRequire: BunPlugin = {
  name: 'inline-create-require',
  setup(build) {
    build.onLoad({ filter: /node_modules\/.*\.js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      if (!source.includes(createRequireDecl)) return undefined;
      return { contents: source.replace(createRequireDecl, ''), loader: 'js' };
    });
  },
};

// node-clingo picks its addon by runtime path; pin the in-tree build with a
// literal require so the .node file is embedded in the binary.
const embedClingoAddon: BunPlugin = {
  name: 'embed-clingo-addon',
  setup(build) {
    build.onLoad({ filter: /node-clingo\/dist\/index\.js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      const patched = source
        .replace(createRequireDecl, '')
        .replace('existsSync(localBinary)', 'true')
        .replace(
          'require(localBinary)',
          "require('../build/Release/node-clingo.node')",
        );
      if (!patched.includes("require('../build/Release/node-clingo.node')"))
        throw new Error('node-clingo addon require not found');
      return { contents: patched, loader: 'js' };
    });
  },
};

// jsdom reads its default stylesheet from disk via __dirname, which the
// bundle bakes in as the build machine's path. Inline it instead.
const inlineJsdomStylesheet: BunPlugin = {
  name: 'inline-jsdom-stylesheet',
  setup(build) {
    build.onLoad(
      { filter: /jsdom\/living\/css\/helpers\/computed-style\.js$/ },
      async (args) => {
        const source = await readFile(args.path, 'utf8');
        const read =
          /fs\.readFileSync\(\s*path\.resolve\(__dirname, "([^"]+)"\),\s*\{ encoding: "utf-8" \}\s*\)/;
        const match = read.exec(source);
        if (!match) throw new Error('jsdom stylesheet read not found');
        const css = await readFile(
          resolve(dirname(args.path), match[1]),
          'utf8',
        );
        return {
          contents: source.replace(read, JSON.stringify(css)),
          loader: 'js',
        };
      },
    );
  },
};

// jsdom resolves its sync-XHR worker script at load; the file isn't in the
// binary, so resolution throws. Sync XHR is unused; point it at nothing.
const stubJsdomSyncXhrWorker: BunPlugin = {
  name: 'stub-jsdom-sync-xhr-worker',
  setup(build) {
    build.onLoad(
      { filter: /jsdom\/living\/xhr\/XMLHttpRequest-impl\.js$/ },
      async (args) => {
        const source = await readFile(args.path, 'utf8');
        const resolveCall = 'require.resolve("./xhr-sync-worker.js")';
        if (!source.includes(resolveCall))
          throw new Error('jsdom xhr worker resolve not found');
        return {
          contents: source.replace(
            resolveCall,
            '"xhr-sync-worker-unavailable"',
          ),
          loader: 'js',
        };
      },
    );
  },
};

function localBuildId(): string {
  const sha = execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  return `local-${sha}`;
}

const here = import.meta.dirname;
const outfile = resolve(
  process.argv[2] ?? resolve(here, '../dist-bin/cyberismo-dev'),
);
const buildId = process.env.CYBERISMO_BUILD_ID || localBuildId();

const result = await Bun.build({
  entrypoints: [resolve(here, 'main.ts')],
  compile: { outfile },
  bytecode: true,
  // Bytecode defaults to CJS, which rejects our top-level await.
  format: 'esm',
  define: { BUILD_ID: JSON.stringify(buildId) },
  plugins: [
    inlineCreateRequire,
    embedClingoAddon,
    inlineJsdomStylesheet,
    stubJsdomSyncXhrWorker,
  ],
});
for (const log of result.logs) console.log(log);
if (!result.success) process.exit(1);
console.log(`built ${outfile} (${buildId})`);
