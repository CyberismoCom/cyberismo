/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, expect, it } from 'vitest';
import {
  CardNotFoundError,
  CycleError,
  ModuleRequestError,
  PermissionDeniedError,
  ReadOnlyContainerError,
} from '@cyberismo/data-handler';
import { errorResponse } from '../src/common/errors.js';

describe('errorResponse', () => {
  it.each([
    [new CardNotFoundError('card_1'), 404, 'not-found'],
    [new ReadOnlyContainerError('mod/templates/page'), 403, 'read-only'],
    [new PermissionDeniedError(['Card is locked']), 403, 'permission-denied'],
    [new CycleError('card_1'), 409, 'cycle'],
  ])('serves %s as %i %s', (error, status, code) => {
    const response = errorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({
      error: error.message,
      code,
      message: error.message,
      details: error.details,
    });
  });

  it("keeps a module request's git detail off the wire", () => {
    const error = new ModuleRequestError(
      "Couldn't fetch module: 'mod' is unreachable",
      'fatal: repository not found',
    );

    expect(errorResponse(error)).toEqual({
      status: 500,
      body: {
        error: error.message,
        code: 'module-request',
        message: error.message,
      },
    });
  });

  it('serves any other error as 500, whatever its Node error code', () => {
    const error = Object.assign(new Error('no such file'), { code: 'ENOENT' });

    expect(errorResponse(error)).toEqual({
      status: 500,
      body: {
        error: 'no such file',
        code: 'internal',
        message: 'no such file',
      },
    });
  });
});
