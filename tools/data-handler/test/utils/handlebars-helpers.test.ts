import { expect, it, describe, beforeEach } from 'vitest';
import Handlebars from 'handlebars';
import {
  registerClingoHelpers,
  registerMathHelpers,
} from '../../src/utils/handlebars-helpers.js';

describe('registerClingoHelpers', () => {
  let handlebars: typeof Handlebars;

  beforeEach(() => {
    handlebars = Handlebars.create();
    registerClingoHelpers(handlebars);
  });

  const render = (template: string, context: unknown) =>
    handlebars.compile(template)(context);

  it('passes through plain strings unchanged', () => {
    expect(render('"{{{clingoEscape value}}}"', { value: 'simple' })).toBe(
      '"simple"',
    );
  });

  it('escapes embedded double quotes', () => {
    expect(render('"{{{clingoEscape value}}}"', { value: 'has "quote"' })).toBe(
      '"has \\"quote\\""',
    );
  });

  it('escapes backslashes', () => {
    expect(render('"{{{clingoEscape value}}}"', { value: 'a\\b' })).toBe(
      '"a\\\\b"',
    );
  });

  it('escapes newlines', () => {
    expect(render('"{{{clingoEscape value}}}"', { value: 'a\nb' })).toBe(
      '"a\\nb"',
    );
  });

  it('returns empty string for non-string values', () => {
    expect(render('"{{{clingoEscape value}}}"', { value: 42 })).toBe('""');
    expect(render('"{{{clingoEscape value}}}"', { value: undefined })).toBe(
      '""',
    );
  });
});

describe('registerMathHelpers', () => {
  let handlebars: typeof Handlebars;

  beforeEach(() => {
    handlebars = Handlebars.create();
    registerMathHelpers(handlebars);
  });

  const render = (template: string, context: unknown = {}) =>
    handlebars.compile(template)(context);

  describe('multiply', () => {
    it('multiplies two integers into an integer', () => {
      expect(render('{{multiply 6 7}}')).toBe('42');
    });

    it('multiplies more than two values', () => {
      expect(render('{{multiply 2 3 4}}')).toBe('24');
    });

    it('produces a number when any operand is a number', () => {
      expect(render('{{multiply 2 2.5}}')).toBe('5');
      expect(render('{{multiply 1.5 1.5}}')).toBe('2.25');
    });

    it('reads numeric parameters from the context', () => {
      expect(render('{{multiply value 2}}', { value: 21 })).toBe('42');
    });
  });

  describe('add', () => {
    it('adds two integers', () => {
      expect(render('{{add 40 2}}')).toBe('42');
    });

    it('adds more than two values', () => {
      expect(render('{{add 1 2 3 4}}')).toBe('10');
    });

    it('produces a number when any operand is a number', () => {
      expect(render('{{add 1 0.5}}')).toBe('1.5');
    });
  });

  describe('subtract', () => {
    it('subtracts two integers', () => {
      expect(render('{{subtract 100 55}}')).toBe('45');
    });

    it('produces a number when any operand is a number', () => {
      expect(render('{{subtract 1 0.25}}')).toBe('0.75');
    });
  });

  describe('divide', () => {
    it('does integer division when both operands are integers', () => {
      expect(render('{{divide 5 2}}')).toBe('2');
      expect(render('{{divide 10 5}}')).toBe('2');
    });

    it('does number division when an operand is a number', () => {
      expect(render('{{divide 5 2.5}}')).toBe('2');
      expect(render('{{divide 7.5 3}}')).toBe('2.5');
    });

    it('returns a division by zero error string', () => {
      expect(render('{{divide 5 0}}')).toBe('Division by zero error');
    });
  });

  describe('int', () => {
    it('returns an integer unchanged', () => {
      expect(render('{{int 42}}')).toBe('42');
    });

    it('truncates a number towards zero', () => {
      expect(render('{{int 42.9}}')).toBe('42');
      expect(render('{{int -42.9}}')).toBe('-42');
    });
  });

  describe('max', () => {
    it('returns the largest of two integers', () => {
      expect(render('{{max 3 7}}')).toBe('7');
    });

    it('returns the largest of more than two values', () => {
      expect(render('{{max 3 7 5 9 1}}')).toBe('9');
    });

    it('preserves the original type of the result', () => {
      expect(render('{{max 1 2.5}}')).toBe('2.5');
    });
  });

  describe('min', () => {
    it('returns the smallest of two integers', () => {
      expect(render('{{min 3 7}}')).toBe('3');
    });

    it('returns the smallest of more than two values', () => {
      expect(render('{{min 3 7 5 9 1}}')).toBe('1');
    });

    it('preserves the original type of the result', () => {
      expect(render('{{min 2 1.5}}')).toBe('1.5');
    });
  });

  describe('invalid input', () => {
    it('throws when a value is not numeric', () => {
      expect(() => render('{{add 1 "foo"}}')).toThrow();
    });

    it('throws when a variadic helper gets fewer than two operands', () => {
      expect(() => render('{{add 1}}')).toThrow();
    });
  });
});
