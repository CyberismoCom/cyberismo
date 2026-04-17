import { expect, it, describe } from 'vitest';

import {
  resolveModuleVersions,
  validateVersionAgainstConstraints,
  type VersionConstraint,
} from '../src/utils/version-resolver.js';

describe('resolveModuleVersions', () => {
  it('returns the highest available version that satisfies a single range', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      ['base', [{ range: '^1.0.0', source: 'project' }]],
    ]);
    const available = new Map<string, string[]>([
      ['base', ['1.2.3', '1.1.0', '1.0.0']],
    ]);

    const resolved = resolveModuleVersions(constraints, available);

    expect(resolved.get('base')).toBe('1.2.3');
  });

  it('treats a bare version as an exact pin', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      ['base', [{ range: '1.0.0', source: 'project' }]],
    ]);
    const available = new Map<string, string[]>([['base', ['1.0.1', '1.0.0']]]);

    const resolved = resolveModuleVersions(constraints, available);

    expect(resolved.get('base')).toBe('1.0.0');
  });

  it('picks the intersection of multiple compatible ranges', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      [
        'base',
        [
          { range: '^1.0.0', source: 'project' },
          { range: '>=1.1.0', source: 'other-module' },
        ],
      ],
    ]);
    const available = new Map<string, string[]>([
      ['base', ['2.0.0', '1.2.0', '1.1.0', '1.0.0']],
    ]);

    const resolved = resolveModuleVersions(constraints, available);

    expect(resolved.get('base')).toBe('1.2.0');
  });

  it('throws when two ranges do not intersect', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      [
        'base',
        [
          { range: '^1.0.0', source: 'project' },
          { range: '^2.0.0', source: 'other' },
        ],
      ],
    ]);
    const available = new Map<string, string[]>([['base', ['2.0.0', '1.0.0']]]);

    expect(() => resolveModuleVersions(constraints, available)).toThrow(
      /Incompatible version requirements for module 'base'/,
    );
  });

  it('throws when no available version satisfies the constraint', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      ['base', [{ range: '^2.0.0', source: 'project' }]],
    ]);
    const available = new Map<string, string[]>([['base', ['1.2.0', '1.0.0']]]);

    expect(() => resolveModuleVersions(constraints, available)).toThrow(
      /No available version satisfies all constraints/,
    );
  });

  it('throws when the range string is not a valid semver range', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      ['base', [{ range: 'not-a-range', source: 'project' }]],
    ]);
    const available = new Map<string, string[]>([['base', ['1.0.0']]]);

    expect(() => resolveModuleVersions(constraints, available)).toThrow(
      /Invalid version range/,
    );
  });

  it('throws when no available versions are known for a constrained module', () => {
    const constraints = new Map<string, VersionConstraint[]>([
      ['base', [{ range: '^1.0.0', source: 'project' }]],
    ]);
    const available = new Map<string, string[]>([['base', []]]);

    expect(() => resolveModuleVersions(constraints, available)).toThrow(
      /No available versions found for module 'base'/,
    );
  });
});

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
