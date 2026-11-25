// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Entrypoint of the `cyberismo-dev` single binary. Static content is embedded
// in the binary; code that walks or copies directories gets a copy extracted
// next to the binary.
import type { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { assetsHash, embeddedAssets } from './embedded-assets.gen.js';
import { registerSelf } from './self.js';

// Replaced at build time, see build.ts.
declare const BUILD_ID: string;

// Extracted next to the binary, so removing a build removes its assets too.
function materialiseAssets(): string {
  const root = join(
    dirname(realpathSync(process.execPath)),
    `assets-${assetsHash}`,
  );
  if (existsSync(join(root, '.complete'))) return root;
  const tmp = `${root}.tmp-${process.pid}`;
  for (const [logical, embedded] of embeddedAssets) {
    const target = join(tmp, logical);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(embedded));
  }
  writeFileSync(join(tmp, '.complete'), '');
  try {
    renameSync(tmp, root);
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    // Fine if another process won the race; its copy is identical.
    if (!existsSync(join(root, '.complete'))) throw error;
  }
  return root;
}

// undici's ProxyAgent is not honoured by Bun, so requests would go direct.
if (process.env.CYBERISMO_EGRESS_PROXY?.trim()) {
  console.error(
    'cyberismo-dev does not support CYBERISMO_EGRESS_PROXY; use the npm-installed cyberismo.',
  );
  process.exit(1);
}

const assetsRoot = materialiseAssets();
process.env.CYBERISMO_STATIC_DIR ??= join(assetsRoot, 'static');
process.env.CYBERISMO_PUBLIC_DIR ??= join(assetsRoot, 'public');

process.removeAllListeners('warning');
const { default: program } = await import('@cyberismo/cli');

program.name('cyberismo-dev');
// Runs before commander's own handler, which prints the version and exits.
(program as unknown as EventEmitter).prependListener('option:version', () =>
  console.log(`cyberismo-dev build: ${BUILD_ID}`),
);
registerSelf(program, BUILD_ID);

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
