import { afterEach, describe, expect, it } from 'vitest';
import { changeSetApiPaths, projectApiPaths } from '@/lib/swr';
import { store } from '@/lib/store';
import { setActiveChangeSet } from '@/lib/slices/changeSet';

describe('API paths with an active changeSet', () => {
  afterEach(() => {
    store.dispatch(setActiveChangeSet({ prefix: 'TST', id: null }));
  });

  it('lead into the active changeSet', () => {
    store.dispatch(setActiveChangeSet({ prefix: 'TST', id: 'abc123' }));
    expect(projectApiPaths('TST').card('TST_1')).toBe(
      '/api/projects/TST/changesets/abc123/cards/TST_1',
    );
    expect(projectApiPaths('TST').events()).toBe(
      '/api/projects/TST/changesets/abc123/events',
    );
    expect(projectApiPaths('OTHER').cards()).toBe('/api/projects/OTHER/cards');
  });

  it('lead into the project without one', () => {
    expect(projectApiPaths('TST').cards()).toBe('/api/projects/TST/cards');
  });

  it('manage changeSets from the project, whatever is active', () => {
    store.dispatch(setActiveChangeSet({ prefix: 'TST', id: 'abc123' }));
    const paths = changeSetApiPaths('TST');
    expect(paths.active()).toBe('/api/projects/TST/changesets/active');
    expect(paths.merge('abc123')).toBe(
      '/api/projects/TST/changesets/abc123/merge',
    );
    expect(paths.reviewed('abc123', 'TST_1')).toBe(
      '/api/projects/TST/changesets/abc123/changes/TST_1/reviewed',
    );
  });
});
