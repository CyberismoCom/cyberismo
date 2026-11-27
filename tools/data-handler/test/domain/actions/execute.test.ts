// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
  LogicInternalError,
  LogicInvalidError,
  LogicNonTotalError,
  LogicUnavailableError,
} from '../../../src/infra/logic/logic-backend.js';
import { actionFailed } from '../../../src/domain/actions/execute.js';
import {
  DHValidationError,
  PermissionDeniedError,
} from '../../../src/shared/exceptions/index.js';

describe('actionFailed', () => {
  it.each<[string, unknown, string]>([
    [
      'LogicUnavailableError',
      new LogicUnavailableError('down'),
      'logic-unavailable',
    ],
    [
      'PermissionDeniedError',
      new PermissionDeniedError(['no']),
      'permission-denied',
    ],
    ['a plain Error', new Error('boom'), 'validation'],
  ])('takes the code of %s', (_, cause, code) => {
    expect(actionFailed(2, 'transition(a,"x")', cause).code).toBe(code);
  });

  it('names the program and the failing effect', () => {
    const error = actionFailed(
      1,
      'transition(a,"x")',
      new DHValidationError('No such transition.'),
    );

    expect(error.message).toBe(
      'Action failed in program 1 at transition(a,"x"): No such transition.',
    );
    expect(error.details).toEqual({ program: 1, effect: 'transition(a,"x")' });
  });

  it('gives the errors of a logic cause, with no effect', () => {
    const error = actionFailed(
      3,
      undefined,
      new LogicNonTotalError('no model', [
        { severity: 'error', message: 'first' },
        { severity: 'error', message: 'second' },
      ]),
    );

    expect(error.message).toBe(
      'Action failed in program 3: first; second. ' +
        'Without autocommit, the changes of the earlier programs were kept.',
    );
    expect(error.code).toBe('logic-non-total');
  });

  it("keeps a logic-internal cause's diagnostics out of the message", () => {
    const error = actionFailed(
      2,
      undefined,
      new LogicInternalError('Logic backend failed', [
        { severity: 'error', message: 'secret program detail' },
      ]),
    );

    expect(error.message).toBe(
      'Action failed in program 2: Logic backend failed. ' +
        'Without autocommit, the changes of the earlier programs were kept.',
    );
    expect(error.details).toEqual({ program: 2 });
  });

  it.each<[string, Error & { details?: Record<string, unknown> }]>([
    ['a permission error', new PermissionDeniedError(['frozen'])],
    [
      'a logic-invalid error',
      new LogicInvalidError('bad', [{ severity: 'error', message: 'syntax' }]),
    ],
  ])('carries the details of %s', (_, cause) => {
    expect(actionFailed(2, 'x', cause).details).toEqual({
      program: 2,
      effect: 'x',
      cause: cause.details,
    });
  });
});
