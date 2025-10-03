import { expect } from 'chai';
import { describe, it } from 'mocha';

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
    expect(userPrefs.getPreferences()).to.be.an('object');
  });

  it('gets edit command preferences', () => {
    expect(userPrefs.getPreferences().editCommand).to.be.an('object');
    expect(userPrefs.getPreferences().editCommand.darwin.command).to.equal(
      'code',
    );
  });

  it('reports errors correctly', () => {
    const malformedJson = '{ "this": "is_missing_a_quote }';

    writeFileSync(TMP_PREFS_PATH, malformedJson);

    expect(() => {
      new UserPreferences(TMP_PREFS_PATH).getPreferences();
    }).to.throw();
  });

  it('reports if the preferences directory is non-writable', () => {
    // On windows, U drive is rarely used, so we can use it to test if the path is writable
    const nonWritablePath =
      platform() === 'win32'
        ? 'U:/this/path/does/not/exist'
        : '/this/path/does/not/exist';

    if (nonWritablePath) {
      expect(() => {
        new UserPreferences(nonWritablePath).getPreferences();
      }).to.throw();
    }
  });
});
