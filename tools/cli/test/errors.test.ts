// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { ERROR_CODES, ERROR_HTTP_STATUS } from '@cyberismo/model';

import { program } from '../src/lib/program.js';
import { exitCodeFor, GENERIC_FAILURE_MESSAGE } from '../src/lib/errors.js';
import { handleResponse } from '../src/lib/output.js';

// Every error code, the HTTP status the backend serves it with, and the CLI
// exit code. Exit codes stay 1 until validation findings land.
const TABLE = [
  ['not-found', 404, 1],
  ['read-only', 403, 1],
  ['permission-denied', 403, 1],
  ['cycle', 409, 1],
  ['conflict', 409, 1],
  ['validation', 400, 1],
  ['container-mismatch', 400, 1],
  ['schema-not-found', 500, 1],
  ['module-request', 500, 1],
  ['macro', 500, 1],
  ['replay-failed', 500, 1],
  ['workspace-disposed', 500, 1],
  ['internal', 500, 1],
] as const;

describe('error codes', () => {
  it('the table covers every code', () => {
    expect(TABLE.map(([code]) => code).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each(TABLE)('%s maps to HTTP %i and exit %i', (code, status, exit) => {
    expect(ERROR_HTTP_STATUS[code]).toBe(status);
    expect(exitCodeFor(code)).toBe(exit);
  });
});

describe('handleResponse', () => {
  it('fails with a generic message and exit 1 when a failure has no message', () => {
    let stderr = '';
    program
      .exitOverride()
      .configureOutput({ writeErr: (text) => (stderr += text) });

    let thrown: unknown;
    try {
      handleResponse({ statusCode: 400, message: '' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CommanderError);
    expect((thrown as CommanderError).exitCode).toBe(1);
    expect(stderr).toBe(`${GENERIC_FAILURE_MESSAGE}\n`);
  });
});
