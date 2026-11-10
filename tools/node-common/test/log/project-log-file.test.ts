// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test } from 'vitest';
import { join } from 'node:path';
import { projectLogFile } from '../../src/log/index.js';

test('uses the local date, zero padded', () => {
  expect(projectLogFile('/p', new Date(2026, 0, 5, 23, 59))).toBe(
    join('/p', '.logs', 'cyberismo-2026-01-05.log'),
  );
});
