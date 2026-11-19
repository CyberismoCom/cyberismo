// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { migration, SCHEMA_VERSION } from '../src/index.js';

describe('migration v7 (createLinks macro)', () => {
  it('is registered and is the current schema version', () => {
    expect(migration(7)).toBeTypeOf('function');
    expect(SCHEMA_VERSION).toBe(7);
  });

  it('runs without changing anything', async () => {
    await expect(
      migration(7)!({
        cardRootPath: '/nonexistent/cardRoot',
        cardsConfigPath: '/nonexistent/.cards',
        fromVersion: 6,
        toVersion: 7,
      }),
    ).resolves.toBeUndefined();
  });
});
