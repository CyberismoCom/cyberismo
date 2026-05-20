// tools/data-handler/test/mutations/dispatcher.test.ts

import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/mutations/dispatcher.js';
import { DefaultNoCascadeHandler } from '../../src/mutations/handlers/default-no-cascade.js';
import { resourceName } from '../../src/utils/resource-utils.js';

describe('dispatcher', () => {
  it('routes display-name change to DefaultNoCascadeHandler', () => {
    const ctx = {
      project: undefined as any, // dispatcher does not touch project
      input: {
        kind: 'edit' as const,
        target: resourceName('test/cardTypes/foo'),
        updateKey: { key: 'displayName' },
        operation: { name: 'change' as const, target: 'Old', to: 'New' },
      },
    };
    const handler = dispatch(ctx);
    expect(handler).toBeInstanceOf(DefaultNoCascadeHandler);
  });

  it('throws when no handler matches', () => {
    const ctx = {
      project: undefined as any,
      input: {
        kind: 'project_rename' as const,
        newPrefix: 'foo',
      },
    };
    expect(() => dispatch(ctx)).toThrow(/no.*handler/i);
  });
});
