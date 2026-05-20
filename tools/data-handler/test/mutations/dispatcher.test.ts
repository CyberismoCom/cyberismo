// tools/data-handler/test/mutations/dispatcher.test.ts

import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/mutations/dispatcher.js';
import { DefaultNoCascadeHandler } from '../../src/mutations/handlers/default-no-cascade.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import type { Project } from '../../src/containers/project.js';

// dispatcher does not touch the Project; pass a stand-in.
const stubProject = undefined as unknown as Project;

describe('dispatcher', () => {
  it('routes display-name change to DefaultNoCascadeHandler', () => {
    const ctx = {
      project: stubProject,
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
      project: stubProject,
      input: {
        kind: 'project_rename' as const,
        newPrefix: 'foo',
      },
    };
    expect(() => dispatch(ctx)).toThrow(/no.*handler/i);
  });
});
