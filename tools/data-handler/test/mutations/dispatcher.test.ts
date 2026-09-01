import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/mutations/dispatcher.js';
import { PlainHandler } from '../../src/mutations/handlers/plain-handler.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import type { Project } from '../../src/containers/project.js';

// dispatcher does not touch the Project; pass a stand-in.
const stubProject = undefined as unknown as Project;

describe('dispatcher', () => {
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

  describe('customFields add/remove routing', () => {
    // Values a card type stops requiring stay dormant on the card, so neither
    // op cascades. Historical sealed log entries carrying them replay through
    // the wildcard row, whose applyCascade() is a no-op.
    for (const op of ['add', 'remove'] as const) {
      it(`'${op}' routes to the non-breaking wildcard PlainHandler`, async () => {
        const ctx = {
          project: stubProject,
          input: {
            kind: 'edit' as const,
            target: resourceName('decision/cardTypes/decision'),
            updateKey: { key: 'customFields' },
            operation: {
              name: op,
              target: { name: 'decision/fieldTypes/responsible' },
            },
          },
        };
        const { handler, classification } = dispatch(ctx);
        expect(handler).toBeInstanceOf(PlainHandler);
        expect(classification).toBe('none');
        // Replaying a sealed entry calls applyCascade() alone. It resolves even
        // against the stub project, so it cannot be reaching for cards.
        await expect(handler.applyCascade(ctx)).resolves.toBeUndefined();
      });
    }
  });
});
