import { describe, expect, it } from 'vitest';

import { checkUpdatesSummary } from '../src/check-updates-summary.js';
import type { ModuleUpdateStatus } from '@cyberismo/data-handler';

const row = (
  name: string,
  status: ModuleUpdateStatus['status'],
): ModuleUpdateStatus => ({ name, isGitModule: true, status });

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
});
