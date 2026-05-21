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
import { describe, it, expect } from 'vitest';
import { errorResponse } from '../../src/common/errors.js';

describe('errorResponse', () => {
  it('returns code, message, and details', () => {
    const body = errorResponse({
      code: 'stale_fingerprint',
      message: 'Plan is stale',
      details: { freshPreview: { foo: 1 } },
    });
    expect(body.code).toBe('stale_fingerprint');
    expect(body.message).toBe('Plan is stale');
    expect(
      (body.details as { freshPreview: { foo: number } }).freshPreview.foo,
    ).toBe(1);
  });

  it('omits details when not provided', () => {
    const body = errorResponse({
      code: 'not_found',
      message: 'Resource missing',
    });
    expect(body.code).toBe('not_found');
    expect(body.details).toBeUndefined();
  });
});
