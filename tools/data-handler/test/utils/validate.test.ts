import { describe, expect, it } from 'vitest';

import {
  DHValidationError,
  SchemaNotFound,
} from '../../src/exceptions/index.js';
import { validateJson } from '../../src/utils/validate.js';

describe('validateJson', () => {
  // The asset schemas point at their own $defs and at each other. Those refs
  // have to resolve, or every validation reports an unrelated error.
  it('follows a $ref into the same schema', () => {
    expect(() =>
      validateJson(
        { cardKeyPrefix: 'Not A Prefix', name: 'x', schemaVersion: 1 },
        { schemaId: 'cardsConfigSchema' },
      ),
    ).toThrow(DHValidationError);
    validateJson(
      { cardKeyPrefix: 'decision', name: 'x', schemaVersion: 1 },
      { schemaId: 'cardsConfigSchema' },
    );
  });

  it('follows a $ref into another schema', () => {
    const hub = (name: string) => ({
      description: 'A hub',
      displayName: 'Hub',
      version: 1,
      modules: [{ name, location: 'https://example.test/module.git' }],
    });

    expect(() =>
      validateJson(hub('Not A Prefix'), { schemaId: 'hubSchema' }),
    ).toThrow(DHValidationError);
    validateJson(hub('mini'), { schemaId: 'hubSchema' });
  });

  it('accepts a schema id with or without a leading slash', () => {
    const config = { cardKeyPrefix: 'decision', name: 'x', schemaVersion: 1 };
    validateJson(config, { schemaId: 'cardsConfigSchema' });
    validateJson(config, { schemaId: '/cardsConfigSchema' });
  });

  it('reports an unknown schema id', () => {
    expect(() => validateJson({}, { schemaId: 'noSuchSchema' })).toThrow(
      SchemaNotFound,
    );
  });
});
