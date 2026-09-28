import { describe, expect, it } from 'vitest';
import { isRefetchable } from '@/lib/api/changesets';

describe('isRefetchable', () => {
  const project = '/api/projects/TST';

  it('refetches the project, the active changeset and changeset records', () => {
    expect(isRefetchable(`${project}/cards/TST_1`, 'TST', 'cs1')).toBe(true);
    expect(isRefetchable(`${project}/changesets/cs1/tree`, 'TST', 'cs1')).toBe(
      true,
    );
    expect(isRefetchable(`${project}/changesets`, 'TST', 'cs1')).toBe(true);
    expect(isRefetchable(`${project}/changesets/active`, 'TST', null)).toBe(
      true,
    );
    expect(isRefetchable(`${project}/changesets/cs2`, 'TST', null)).toBe(true);
  });

  it('leaves other changesets’ data cached, unfetched', () => {
    expect(isRefetchable(`${project}/changesets/cs2/tree`, 'TST', 'cs1')).toBe(
      false,
    );
    expect(
      isRefetchable(`${project}/changesets/cs1/changes`, 'TST', null),
    ).toBe(false);
  });

  it('ignores other projects and non-string keys', () => {
    expect(isRefetchable('/api/projects/OTHER/cards', 'TST', null)).toBe(false);
    expect(isRefetchable(['key'], 'TST', null)).toBe(false);
  });
});
