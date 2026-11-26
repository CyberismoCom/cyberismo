// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { errorFunction } from '../../shared/utils/error-utils.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import {
  Refused,
  STEPS,
  type CheckedEffect,
  type EffectRow,
  type Trigger,
} from './effects/define.js';
import type { CreatedCard } from './facts.js';
import { compareKeys, compareText, treeOrder } from './order.js';

/** An effect the check refused, and why. */
export interface Refusal {
  atom: string;
  reason: string;
}

/** An effect that failed while it was applied. */
export class EffectFailed extends Error {
  constructor(
    readonly atom: string,
    cause: unknown,
  ) {
    super(atom, { cause });
  }
}

/** What applying effects hands to its caller as it goes. */
export interface ApplyOptions {
  /**
   * Takes a failure instead of an EffectFailed being thrown; the next
   * effect is then applied.
   */
  onFailure?: (atom: string, error: unknown) => void;
  /** Takes what an applied effect sets off, right after the effect. */
  afterTrigger?: (trigger: Trigger) => Promise<void>;
  /**
   * Whether the caller's operation already performed what an effect sets
   * off: the effect is then in place, and nothing of it is applied.
   */
  performed?: (trigger: Trigger) => boolean;
}

/**
 * Checks one program's effects before any of them is applied. Each effect is
 * checked alone; then every effect of a conflict, as the `conflict` of the
 * effects tells, is refused.
 * @param checkout The checkout the effects will change.
 * @param rows The program's effects, in the order of their atoms.
 * @param lenient Whether an unexpected error in the check of an effect
 *   refuses that effect instead of being thrown.
 * @returns the effects that passed, in the same order, and the refusals
 */
export function checkEffects(
  checkout: Checkout,
  rows: EffectRow[],
  lenient = false,
): { checked: CheckedEffect[]; refused: Refusal[] } {
  const alone = rows.map((effect): CheckedEffect | Refusal => {
    try {
      return effect.kind.check(checkout, effect);
    } catch (error) {
      if (error instanceof Refused) {
        return { atom: effect.atom, reason: error.message };
      }
      if (lenient) {
        return { atom: effect.atom, reason: errorFunction(error) };
      }
      throw error;
    }
  });
  const passed = (effect: CheckedEffect | Refusal): effect is CheckedEffect =>
    'step' in effect;

  // The effects that share what they change, with their distinct values.
  const groups = new Map<
    string,
    { values: Set<string>; members: number[]; reason: string }
  >();
  const repeated = new Set<number>();
  alone.forEach((effect, index) => {
    if (!passed(effect) || !effect.conflict) return;
    const { on, value = String(index), once, reason } = effect.conflict;
    const key = JSON.stringify(on);
    const group = groups.get(key) ?? {
      values: new Set<string>(),
      members: [],
      reason,
    };
    groups.set(key, group);
    if (once && group.values.has(value)) {
      repeated.add(index);
      return;
    }
    group.values.add(value);
    group.members.push(index);
  });
  const conflicts = new Map<number, string>();
  for (const group of groups.values()) {
    if (group.values.size > 1) {
      for (const index of group.members) conflicts.set(index, group.reason);
    }
  }

  const checked: CheckedEffect[] = [];
  const refused: Refusal[] = [];
  alone.forEach((effect, index) => {
    const reason = passed(effect) ? conflicts.get(index) : effect.reason;
    if (reason !== undefined) {
      refused.push({ atom: effect.atom, reason });
    } else if (passed(effect) && !repeated.has(index)) {
      checked.push(effect);
    }
  });
  return { checked, refused };
}

/**
 * Applies checked effects step by step, in the order of STEPS. Within a
 * step, in the order of the effects' sort keys, then of their atoms. An
 * effect already in place, or whose trigger was `performed`, is skipped.
 * What an applied effect's `trigger` gives goes to `afterTrigger`.
 * @returns the cards the effects created, in creation order
 * @throws EffectFailed on the first failure
 */
export async function applyEffects(
  checkout: Checkout,
  effects: CheckedEffect[],
  options?: ApplyOptions,
): Promise<CreatedCard[]> {
  const triggered = async (effect: CheckedEffect, made: CreatedCard[]) => {
    if (effect.trigger) await options?.afterTrigger?.(effect.trigger(made));
  };
  const performed = (effect: CheckedEffect) =>
    !!effect.trigger && !!options?.performed?.(effect.trigger([]));
  let order: Map<string, number> | undefined;
  const position = (cardKey: string) =>
    (order ??= treeOrder(checkout)).get(cardKey);
  const created: CreatedCard[] = [];
  for (const step of STEPS) {
    const inStep = effects
      .filter((effect) => effect.step === step)
      .map((effect) => ({ effect, key: effect.sortKey(position) }))
      .sort(
        (a, b) =>
          compareKeys(a.key, b.key) ||
          compareText(a.effect.atom, b.effect.atom),
      );
    for (const { effect } of inStep) {
      const before = created.length;
      try {
        if (effect.inPlace(checkout) || performed(effect)) continue;
        created.push(...(await effect.apply(checkout)));
      } catch (error) {
        if (options?.onFailure) {
          options.onFailure(effect.atom, error);
          continue;
        }
        throw new EffectFailed(effect.atom, error);
      }
      await triggered(effect, created.slice(before));
    }
  }
  return created;
}
