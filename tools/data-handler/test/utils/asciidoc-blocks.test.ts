import { describe, it, expect } from 'vitest';

import { closeUnterminatedBlock } from '../../src/utils/asciidoc-blocks.js';

describe('closeUnterminatedBlock', () => {
  it('closes an unterminated table', () => {
    expect(closeUnterminatedBlock('|===\n| a\n')).toBe('|===\n| a\n|===\n');
  });

  it('adds a newline before the delimiter when the content lacks one', () => {
    expect(closeUnterminatedBlock('----\ncode')).toBe('----\ncode\n----\n');
  });

  it('closes a fenced code block', () => {
    expect(closeUnterminatedBlock('```js\ncode\n')).toBe('```js\ncode\n```\n');
  });

  it('leaves terminated blocks unchanged', () => {
    const content = '|===\n| a\n|===\n\n====\n----\ncode\n----\n====\n';
    expect(closeUnterminatedBlock(content)).toBe(content);
  });

  it('ignores delimiters inside a block', () => {
    // The listing ends at its first matching line, so the inner '|===' is text
    const content = '----\n|===\n----\n';
    expect(closeUnterminatedBlock(content)).toBe(content);
  });

  it('only closes the outermost open block', () => {
    // The inner listing ends where the example block ends
    expect(closeUnterminatedBlock('====\n----\ncode\n')).toBe(
      '====\n----\ncode\n====\n',
    );
  });

  it('requires the same delimiter length to close a block', () => {
    expect(closeUnterminatedBlock('=====\ntext\n====\n')).toBe(
      '=====\ntext\n====\n=====\n',
    );
  });
});
