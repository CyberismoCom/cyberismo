// testing
import { afterEach, describe, expect, it, vi } from 'vitest';

// cyberismo
import {
  applySideEffects,
  type SideEffects,
} from '../src/domain/cards/side-effects.js';
import { CardMetadataUpdater } from '../src/domain/cards/card-metadata-updater.js';
import type { Checkout } from '../src/state/checkout/checkout.js';

const checkout = {} as Checkout;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applySideEffects', () => {
  it('propagates a CardMetadataUpdater failure on the initial effects', async () => {
    vi.spyOn(CardMetadataUpdater, 'apply').mockRejectedValue(
      new Error('bad field'),
    );
    const effects: SideEffects = {
      updateFields: [{ card: 'a_1', field: 'title', newValue: 'x' }],
    };
    await expect(
      applySideEffects(checkout, effects, new Set<string>(), vi.fn()),
    ).rejects.toThrow('bad field');
  });

  it('executes transitions breadth-first and cascades nested effects', async () => {
    const order: string[] = [];
    const nested: Record<string, SideEffects | undefined> = {
      'b_1:t1': {
        executeTransition: [{ card: 'c_1', transitionToExecute: 't2' }],
      },
    };
    const perform = vi.fn(async (card: string, transition: string) => {
      order.push(`${card}:${transition}`);
      return nested[`${card}:${transition}`];
    });
    await applySideEffects(
      checkout,
      {
        executeTransition: [
          { card: 'b_1', transitionToExecute: 't1' },
          { card: 'd_1', transitionToExecute: 't3' },
        ],
      },
      new Set<string>(),
      perform,
    );
    expect(order).toEqual(['b_1:t1', 'd_1:t3', 'c_1:t2']);
  });
});
