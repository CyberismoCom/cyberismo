// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// `pnpm lint [--fix]`: the SPDX header check, then ESLint in every package.
// pnpm appends extra arguments only to the last command of a script, hence
// this wrapper: `--fix` has to reach both.
// Headers go first because the ESLint header rule's --fix would overwrite a
// header that is not ours (and a leading pragma comment); when the header
// check leaves a file unfixed, ESLint runs without --fix.

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
// pnpm is a .cmd shim on Windows.
const shell = process.platform === 'win32';
const run = (cmd, cmdArgs) =>
  spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell }).status === 0;

const headersOk = run('node', [
  'scripts/check-headers.mjs',
  ...args.filter((a) => a === '--fix'),
]);
const eslintOk = run('pnpm', [
  '-r',
  'run',
  'lint',
  ...(headersOk ? args : args.filter((a) => a !== '--fix')),
]);
process.exitCode = headersOk && eslintOk ? 0 : 1;
