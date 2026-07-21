// testing
import { afterEach, describe, expect, it, vi } from 'vitest';

// cyberismo
import { applySideEffects, type SideEffects } from '../src/side-effects.js';
import { CardMetadataUpdater } from '../src/card-metadata-updater.js';
import type { Project } from '../src/containers/project.js';

const project = {} as Project;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applySideEffects', () => {
  it('does nothing without effects', async () => {
    const perform = vi.fn(async () => undefined);
    await applySideEffects(project, undefined, new Set<string>(), perform);
    expect(perform).not.toHaveBeenCalled();
  });

  it('applies updateFields through CardMetadataUpdater', async () => {
    const apply = vi
      .spyOn(CardMetadataUpdater, 'apply')
      .mockResolvedValue(undefined);
    const effects: SideEffects = {
      updateFields: [{ card: 'a_1', field: 'title', newValue: 'x' }],
    };
    await applySideEffects(project, effects, new Set<string>(), vi.fn());
    expect(apply).toHaveBeenCalledWith(project, effects.updateFields);
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
      project,
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

  it('skips pairs already in the visited set', async () => {
    const perform = vi.fn(async () => undefined);
    await applySideEffects(
      project,
      { executeTransition: [{ card: 'a_1', transitionToExecute: 't1' }] },
      new Set(['a_1:t1']),
      perform,
    );
    expect(perform).not.toHaveBeenCalled();
  });

  it('terminates when a side effect re-triggers itself', async () => {
    const perform = vi.fn(
      async (card: string, transition: string): Promise<SideEffects> => ({
        executeTransition: [{ card, transitionToExecute: transition }],
      }),
    );
    await applySideEffects(
      project,
      { executeTransition: [{ card: 'a_1', transitionToExecute: 't1' }] },
      new Set<string>(),
      perform,
    );
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('continues with remaining side effects when one fails', async () => {
    const perform = vi
      .fn(async (): Promise<SideEffects | undefined> => undefined)
      .mockRejectedValueOnce(new Error('missing card'));
    await applySideEffects(
      project,
      {
        executeTransition: [
          { card: 'a_1', transitionToExecute: 't1' },
          { card: 'b_1', transitionToExecute: 't2' },
        ],
      },
      new Set<string>(),
      perform,
    );
    expect(perform).toHaveBeenCalledTimes(2);
  });
});
