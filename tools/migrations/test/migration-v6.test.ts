// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { migration } from '../src/index.js';

describe('migration v6 (field macro)', () => {
  it('is registered', () => {
    expect(migration(6)).toBeTypeOf('function');
  });

  it('runs without changing anything', async () => {
    await expect(
      migration(6)!({
        cardRootPath: '/nonexistent/cardRoot',
        cardsConfigPath: '/nonexistent/.cards',
        fromVersion: 5,
        toVersion: 6,
      }),
    ).resolves.toBeUndefined();
  });
});
