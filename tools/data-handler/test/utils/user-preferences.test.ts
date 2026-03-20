import { expect, describe, it } from 'vitest';

import { UserPreferences } from '../../src/utils/user-preferences.js';
import { platform, tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, writeFileSync } from 'node:fs';

describe('UserPreferences', () => {
  const TMP_PREFS_PATH = join(tmpdir(), '.cards.prefs.json');

  let userPrefs: UserPreferences;

  beforeEach(() => {
    userPrefs = new UserPreferences(TMP_PREFS_PATH);
  });

  afterEach(() => {
    unlinkSync(TMP_PREFS_PATH);
  });

  it('gets preferences', () => {
    expect(userPrefs.getPreferences()).toBeTypeOf('object');
  });

  it('gets edit command preferences', () => {
    expect(userPrefs.getPreferences().editCommand).toBeTypeOf('object');
    expect(userPrefs.getPreferences().editCommand.darwin.command).toBe('code');
  });

  it('reports errors correctly', () => {
    const malformedJson = '{ "this": "is_missing_a_quote }';

    writeFileSync(TMP_PREFS_PATH, malformedJson);

    expect(() => {
      new UserPreferences(TMP_PREFS_PATH).getPreferences();
    }).toThrow();
  });

  it('reports if the preferences directory is non-writable', () => {
    // On windows, U drive is rarely used, so we can use it to test if the path is writable
    const nonWritablePath =
      platform() === 'win32'
        ? 'U:/this/path/does/not/exist'
        : '/this/path/does/not/exist';

    expect(() => {
      new UserPreferences(nonWritablePath).getPreferences();
    }).toThrow();
  });
});
