import { expect, it, describe, beforeEach } from 'vitest';
import Handlebars from 'handlebars';
import { registerClingoHelpers } from '../../src/utils/handlebars-helpers.js';

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
