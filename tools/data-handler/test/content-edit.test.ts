import { expect, it, describe } from 'vitest';

import { applyContentEdits } from '../src/utils/content-edit.js';

describe('applyContentEdits', () => {
  it('applies a single edit', () => {
    expect(
      applyContentEdits('Hello world, hello again', [
        { oldString: 'world', newString: 'there' },
      ]),
    ).to.equal('Hello there, hello again');
  });

  it('applies edits sequentially, each seeing the previous result', () => {
    expect(
      applyContentEdits('one two three', [
        { oldString: 'one', newString: 'four' },
        { oldString: 'four two', newString: 'done' },
      ]),
    ).to.equal('done three');
  });

  it('inserts $-patterns in newString literally (no replace() expansion)', () => {
    // Regression: String.replace would expand $&, $$, $', $` in newString
    expect(
      applyContentEdits('cost X now', [
        { oldString: 'X', newString: '$$5 or $&' },
      ]),
    ).to.equal('cost $$5 or $& now');
    expect(
      applyContentEdits('latexmath:[X]', [
        { oldString: 'X', newString: '$$x^2$$' },
      ]),
    ).to.equal('latexmath:[$$x^2$$]');
  });

  it('replaces every occurrence with replaceAll', () => {
    expect(
      applyContentEdits('dup dup dup', [
        { oldString: 'dup', newString: 'x', replaceAll: true },
      ]),
    ).to.equal('x x x');
  });

  it('throws on ambiguous match without replaceAll', () => {
    expect(() =>
      applyContentEdits('dup dup dup', [{ oldString: 'dup', newString: 'x' }]),
    ).to.throw(/matches 3 times/);
  });

  it('throws when oldString is not found', () => {
    expect(() =>
      applyContentEdits('some content', [
        { oldString: 'missing', newString: 'x' },
      ]),
    ).to.throw(/not found/);
  });

  it('throws when oldString is empty', () => {
    // Regression: ''.split('') made occurrence counting bypass all guards
    expect(() =>
      applyContentEdits('abc', [
        { oldString: '', newString: 'x', replaceAll: true },
      ]),
    ).to.throw(/cannot be empty/);
    expect(() =>
      applyContentEdits('', [{ oldString: '', newString: 'x' }]),
    ).to.throw(/cannot be empty/);
  });

  it('throws when oldString equals newString', () => {
    expect(() =>
      applyContentEdits('no-op content', [
        { oldString: 'no-op', newString: 'no-op' },
      ]),
    ).to.throw(/identical/);
  });

  it('throws when no edits are provided', () => {
    expect(() => applyContentEdits('content', [])).to.throw(
      /No edits provided/,
    );
  });

  it('reports the index of the failing edit', () => {
    expect(() =>
      applyContentEdits('one two', [
        { oldString: 'one', newString: '1' },
        { oldString: 'missing', newString: 'x' },
      ]),
    ).to.throw(/^Edit 1:/);
  });

  it('matches whitespace and line breaks exactly', () => {
    expect(
      applyContentEdits('line one\nline two\n', [
        { oldString: 'one\nline', newString: '1\nrow' },
      ]),
    ).to.equal('line 1\nrow two\n');
  });
});
