import { describe, it, expect } from 'vitest';

import { detectMigrationPathConflicts } from '../../../src/mutations/module-update/conflicts.js';

describe('detectMigrationPathConflicts', () => {
  it('no conflict for linear minor chain', () => {
    const conflicts = detectMigrationPathConflicts({
      modulePrefix: 'shared/security',
      fromVersion: '1.5.0',
      toVersion: '1.7.0',
      availableSealedVersions: ['1.0.0', '1.5.0', '1.6.0', '1.7.0'],
    });
    expect(conflicts).toEqual([]);
  });

  it('no conflict for major upgrade with linear chain', () => {
    const conflicts = detectMigrationPathConflicts({
      modulePrefix: 'shared/security',
      fromVersion: '1.5.0',
      toVersion: '2.0.0',
      availableSealedVersions: ['1.5.0', '1.6.0', '2.0.0'],
    });
    expect(conflicts).toEqual([]);
  });

  it('flags migration_path_unreachable for diverged minor on old major', () => {
    // The 1.6.0 was sealed AFTER 2.0.0 — sibling branches.
    // Heuristic: from 1.6.0 to 2.0.0 is impossible because the chain
    // contains 1.6.0 itself, which 2.0.0's release wasn't built against.
    const conflicts = detectMigrationPathConflicts({
      modulePrefix: 'shared/security',
      fromVersion: '1.6.0',
      toVersion: '2.0.0',
      availableSealedVersions: ['1.5.0', '1.6.0', '2.0.0'],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('migration_path_unreachable');
    expect(conflicts[0].suggestedTargetVersion).toBe('1.5.0');
  });
});
