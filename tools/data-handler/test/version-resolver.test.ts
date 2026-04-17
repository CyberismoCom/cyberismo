import { expect, it, describe } from 'vitest';

import { validateVersionAgainstConstraints } from '../src/modules/version.js';

describe('validateVersionAgainstConstraints', () => {
  it('accepts a version that satisfies every constraint', () => {
    expect(() =>
      validateVersionAgainstConstraints('base', '1.2.3', [
        { range: '^1.0.0', source: 'project' },
        { range: '>=1.2.0', source: 'other' },
      ]),
    ).not.toThrow();
  });

  it('rejects a version that violates any constraint', () => {
    expect(() =>
      validateVersionAgainstConstraints('base', '2.0.0', [
        { range: '^1.0.0', source: 'project' },
      ]),
    ).toThrow(/does not satisfy constraint '\^1\.0\.0'/);
  });

  it('accepts when the constraint list is empty', () => {
    expect(() =>
      validateVersionAgainstConstraints('base', '1.0.0', []),
    ).not.toThrow();
  });
});
