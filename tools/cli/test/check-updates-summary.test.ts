import { describe, expect, it } from 'vitest';

import {
  checkUpdatesRow,
  checkUpdatesSummary,
} from '../src/check-updates-summary.js';
import type { ModuleUpdateStatus } from '@cyberismo/data-handler';

const row = (
  name: string,
  status: ModuleUpdateStatus['status'],
  extra: Partial<ModuleUpdateStatus> = {},
): ModuleUpdateStatus => ({ name, isGitModule: true, status, ...extra });

describe('checkUpdatesSummary', () => {
  it('claims up to date only when every module actually is', () => {
    expect(checkUpdatesSummary([row('a', 'up_to_date')])).toEqual([
      'All modules are up to date.',
    ]);
  });

  it('a blocked row suppresses the up-to-date claim', () => {
    const lines = checkUpdatesSummary([
      row('a', 'up_to_date'),
      row('b', 'blocked'),
    ]);
    expect(lines.join('\n')).not.toContain('up to date');
    expect(lines.join('\n')).toContain('blocked');
  });

  it('an unreachable row suppresses the up-to-date claim', () => {
    const lines = checkUpdatesSummary([row('a', 'source_unreachable')]);
    expect(lines.join('\n')).not.toContain('up to date');
    expect(lines.join('\n')).toContain('unreachable');
  });

  it('available updates are counted, with blocked rows noted alongside', () => {
    const lines = checkUpdatesSummary([
      row('a', 'update_available'),
      row('b', 'blocked'),
    ]);
    expect(lines).toEqual([
      '1 module(s) have updates available.',
      '1 module(s) are blocked — resolve conflicts before upgrading.',
    ]);
  });

  it('a held-back row replaces the up-to-date claim', () => {
    const lines = checkUpdatesSummary([
      row('a', 'up_to_date', {
        installedVersion: '1.0.0',
        latestAvailable: { version: '2.0.0', range: '1.0.0' },
      }),
    ]);
    expect(lines).toEqual([
      '1 module(s) held back by their declared range — edit the range in cardsConfig.json to allow the newer version.',
    ]);
  });

  it('the held-back note joins the updatable count when both exist', () => {
    const lines = checkUpdatesSummary([
      row('a', 'update_available', {
        latestAvailable: { version: '2.0.0', range: '^1.0.0' },
      }),
      row('b', 'up_to_date'),
    ]);
    expect(lines).toEqual([
      '1 module(s) have updates available.',
      '1 module(s) held back by their declared range — edit the range in cardsConfig.json to allow the newer version.',
    ]);
  });
});

describe('checkUpdatesRow', () => {
  it('renders the plain row shapes', () => {
    expect(
      checkUpdatesRow(row('a', 'up_to_date', { installedVersion: '1.0.0' })),
    ).toBe('  a    1.0.0  (up to date)');
    expect(
      checkUpdatesRow(row('a', 'up_to_date', { isGitModule: false })),
    ).toBe('  a    (local module)');
    expect(
      checkUpdatesRow(
        row('a', 'update_available', {
          installedVersion: '1.0.0',
          reachableVersion: '1.1.0',
          cascade: [
            { module: 'a', from: '1.0.0', to: '1.1.0' },
            { module: 'dep', from: null, to: '1.0.0' },
          ],
        }),
      ),
    ).toBe('  a    1.0.0  →  1.1.0  (also updates: dep)');
    expect(
      checkUpdatesRow(
        row('a', 'blocked', {
          conflicts: [{ module: 'dep', reason: 'needs 1.1.0' }],
        }),
      ),
    ).toBe('  a    blocked  dep: needs 1.1.0');
    expect(checkUpdatesRow(row('a', 'source_unreachable'))).toBe(
      '  a    (source unreachable)',
    );
  });

  it('folds the held-back notice into an up-to-date row', () => {
    expect(
      checkUpdatesRow(
        row('a', 'up_to_date', {
          installedVersion: '1.0.0',
          latestAvailable: { version: '2.0.0', range: '1.0.0' },
        }),
      ),
    ).toBe("  a    1.0.0  (up to date; 2.0.0 available outside '1.0.0')");
  });

  it('appends the held-back notice after the cascade on an update row', () => {
    expect(
      checkUpdatesRow(
        row('a', 'update_available', {
          installedVersion: '1.0.0',
          reachableVersion: '1.1.0',
          cascade: [{ module: 'a', from: '1.0.0', to: '1.1.0' }],
          latestAvailable: { version: '2.0.0', range: '^1.0.0' },
        }),
      ),
    ).toBe("  a    1.0.0  →  1.1.0  (2.0.0 available outside '^1.0.0')");
  });
});
