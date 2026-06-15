import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/mutations/dispatcher.js';
import { PlainHandler } from '../../src/mutations/handlers/plain-handler.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import type { Project } from '../../src/containers/project.js';

// dispatcher does not touch the Project; pass a stand-in.
const stubProject = undefined as unknown as Project;

describe('dispatcher', () => {
  it('routes a display-name change to the plain handler (non-breaking)', () => {
    const ctx = {
      project: stubProject,
      input: {
        kind: 'edit' as const,
        target: resourceName('test/cardTypes/foo'),
        updateKey: { key: 'displayName' },
        operation: { name: 'change' as const, target: 'Old', to: 'New' },
      },
    };
    const { handler, breaking } = dispatch(ctx);
    expect(handler).toBeInstanceOf(PlainHandler);
    expect(breaking).toBe(false);
  });

  it('throws when no route matches (edit on an unregistered key)', () => {
    const ctx = {
      project: stubProject,
      input: {
        kind: 'edit' as const,
        target: resourceName('test/cardTypes/foo'),
        // No ROUTES row (specific or wildcard) registers this key.
        updateKey: { key: 'noSuchKey' },
        operation: { name: 'change' as const, target: 'Old', to: 'New' },
      },
    };
    expect(() => dispatch(ctx)).toThrow(/no.*handler/i);
  });
});
