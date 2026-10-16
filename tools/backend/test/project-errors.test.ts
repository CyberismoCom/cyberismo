// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, test } from 'vitest';
import { formatProjectErrors } from '@cyberismo/model';

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
