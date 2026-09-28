import { describe, expect, it } from 'vitest';
import { lineDiff } from '@/lib/lineDiff';

describe('lineDiff', () => {
  it('keeps common lines and marks the rest', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
  });

  it('treats empty text as no lines', () => {
    expect(lineDiff('', 'new')).toEqual([{ kind: 'added', text: 'new' }]);
    expect(lineDiff('old', '')).toEqual([{ kind: 'removed', text: 'old' }]);
    expect(lineDiff('', '')).toEqual([]);
  });
});
