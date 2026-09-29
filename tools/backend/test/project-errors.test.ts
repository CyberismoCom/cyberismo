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
import { describe, expect, test } from 'vitest';
import { formatProjectErrors } from '../src/project-errors.js';

describe('formatProjectErrors', () => {
  test('groups messages under their project and caps each project separately', () => {
    const many = Array.from({ length: 5 }, (_, i) => `e${i}`);
    expect(
      formatProjectErrors(
        [
          { prefix: 'ABC', errors: ['one'] },
          { prefix: 'XYZ', errors: many },
        ],
        2,
      ),
    ).toBe(
      [
        '2 projects have errors:',
        'ABC (1):\n  one',
        'XYZ (5):\n  e0\n  e1\n  … 3 more',
      ].join('\n\n'),
    );
  });

  test('uses the singular heading for one project', () => {
    expect(formatProjectErrors([{ prefix: 'ABC', errors: ['x'] }])).toMatch(
      /^1 project has errors:/,
    );
  });
});
