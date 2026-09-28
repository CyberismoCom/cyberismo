import { describe, expect, it } from 'vitest';

import { cardFileOf } from '../src/changesets/card-paths.js';
import {
  mergeAppendOnlyLog,
  mergeCardMetadata,
} from '../src/changesets/metadata-merge.js';

describe('cardFileOf', () => {
  it.each([
    [
      'cardRoot/p_1/index.json',
      {
        key: 'p_1',
        parent: 'root',
        role: 'metadata',
        cardPath: 'cardRoot/p_1',
      },
    ],
    [
      'cardRoot/p_1/c/p_2/index.adoc',
      {
        key: 'p_2',
        parent: 'p_1',
        role: 'content',
        cardPath: 'cardRoot/p_1/c/p_2',
      },
    ],
    [
      'cardRoot/p_1/c/p_2/a/image.png',
      { key: 'p_2', role: 'attachment', attachment: 'image.png' },
    ],
    ['cardRoot/p_1/a/c', { key: 'p_1', role: 'attachment', attachment: 'c' }],
    [
      '.cards/local/templates/page/c/p_3/index.json',
      {
        key: 'p_3',
        template: 'page',
        parent: 'root',
        role: 'metadata',
        cardPath: '.cards/local/templates/page/c/p_3',
      },
    ],
  ])('maps %s to its card', (path, expected) => {
    expect(cardFileOf(path)).toMatchObject(expected);
  });

  it.each(['.cards/local/cardsConfig.json', 'cardRoot/.schema', 'README.md'])(
    'does not map %s to a card',
    (path) => {
      expect(cardFileOf(path)).toBeUndefined();
    },
  );
});

describe('mergeCardMetadata', () => {
  const base = {
    title: 'Base',
    workflowState: 'Draft',
    rank: '0|a',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    links: [{ linkType: 't', cardKey: 'p_9' }],
  };

  it('takes each side’s changes to different fields', () => {
    const result = mergeCardMetadata(
      base,
      { ...base, title: 'Ours', lastUpdated: '2026-02-01T00:00:00.000Z' },
      {
        ...base,
        workflowState: 'Approved',
        lastUpdated: '2026-03-01T00:00:00.000Z',
      },
    );
    expect(result).toEqual({
      merged: {
        ...base,
        title: 'Ours',
        workflowState: 'Approved',
        lastUpdated: '2026-03-01T00:00:00.000Z',
      },
      conflicts: [],
    });
  });

  it('merges links as a set', () => {
    const added = { linkType: 't', cardKey: 'p_7' };
    const result = mergeCardMetadata(
      base,
      { ...base, links: [...base.links, added] },
      { ...base, links: [] },
    );
    expect(result.merged?.links).toEqual([added]);
  });

  it('reports a field changed differently on both sides', () => {
    expect(
      mergeCardMetadata(
        base,
        { ...base, title: 'Ours' },
        { ...base, title: 'Theirs' },
      ),
    ).toEqual({ conflicts: ['title'] });
  });

  it('keeps our rank when both sides re-ranked', () => {
    const result = mergeCardMetadata(
      base,
      { ...base, rank: '0|b' },
      { ...base, rank: '0|c' },
    );
    expect(result.merged?.rank).toBe('0|b');
  });
});

describe('mergeAppendOnlyLog', () => {
  it('appends the entries only theirs has', () => {
    expect(mergeAppendOnlyLog('a\nb\n', 'a\nc\n')).toBe('a\nb\nc\n');
  });
});
