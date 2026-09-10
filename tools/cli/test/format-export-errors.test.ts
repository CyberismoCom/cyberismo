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
import { formatExportErrors } from '../src/format-errors.js';

describe('formatExportErrors', () => {
  it('groups errors under their project prefix', () => {
    const output = formatExportErrors([
      { prefix: 'decision', error: 'Card decision_1 not found' },
      { prefix: 'base', error: 'Missing calculation' },
      { prefix: 'decision', error: 'Card decision_2 not found' },
    ]);
    expect(output).toBe(
      [
        "Errors in project 'decision':",
        'Card decision_1 not found',
        'Card decision_2 not found',
        "Errors in project 'base':",
        'Missing calculation',
      ].join('\n'),
    );
  });

  it('falls back to "unknown project" when the prefix could not be determined', () => {
    const output = formatExportErrors([{ error: 'Something failed' }]);
    expect(output).toBe(
      ["Errors in project 'unknown project':", 'Something failed'].join('\n'),
    );
  });
});
