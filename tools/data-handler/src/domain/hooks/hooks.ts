// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ClingoFactBuilder } from '../../infra/engine/clingo-fact-builder.js';
import { errorFunction } from '../../shared/utils/error-utils.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import {
  applyEffects,
  checkEffects,
  effectRule,
  quoted,
  setField,
  solveEffects,
  transition,
  type ApplyOptions,
  type CheckedEffect,
  type Trigger,
} from '../actions/index.js';

const logger = getChildLogger({ module: 'hooks' });

// The kinds of effect a hook may ask for.
const HOOK_EFFECTS = [setField, transition];

// The program that derives a trigger's hook effects from the hooks the
// project's logic programs declare with onTransitionSetField/5 and
// onTransitionExecuteTransition/4: the one definition of what a hook sets
// off. The hooks of a created card are those of the transition that creates
// a card in its workflow. Deny rules are not read here; each effect meets
// them when it is checked and applied, as an action's effects do.
function hookProgram(trigger: Trigger): string {
  // The rules of the hooks declared for a card and transition, written as
  // `on`, once `given` holds.
  const rules = (given: string, on: string) => [
    effectRule(
      setField,
      `${given}onTransitionSetField(${on}, Card, Field, Value)`,
    ),
    effectRule(
      transition,
      `${given}onTransitionExecuteTransition(${on}, Card, Transition)`,
    ),
  ];
  if (trigger.kind === 'transition') {
    return rules('', `${trigger.card}, ${quoted(trigger.transition)}`).join(
      '\n',
    );
  }
  return [
    ...trigger.cards.map((key) =>
      new ClingoFactBuilder('createdCard').addLiteralArgument(key).build(),
    ),
    ...rules(
      'createdCard(New), field(New, "cardType", Type), field(Type, "workflow", Workflow), workflowTransition(Workflow, Create, "", _), ',
      'New, Create',
    ),
  ].join('\n');
}

// Lenient application, logging each failure with its trigger.
const lenient = (trigger: Trigger): ApplyOptions => ({
  onFailure: (atom, error) =>
    logger.warn(
      { trigger, atom, error: errorFunction(error) },
      'Hook effect skipped',
    ),
});

// The checked effects of a trigger's hooks. Each effect that cannot be read
// or checked is logged and left out; only a failed program leaves out all.
async function hookEffects(
  checkout: Checkout,
  trigger: Trigger,
): Promise<CheckedEffect[]> {
  if (trigger.kind === 'creation' && trigger.cards.length === 0) return [];
  let pending;
  try {
    pending = await solveEffects(
      checkout,
      hookProgram(trigger),
      HOOK_EFFECTS,
      false,
    );
  } catch (error) {
    logger.warn(
      { trigger, error: errorFunction(error) },
      'Hook query failed; hooks skipped',
    );
    return [];
  }
  const { checked, refused } = checkEffects(checkout, pending, true);
  for (const { atom, reason } of refused) {
    logger.warn({ trigger, atom, error: reason }, 'Hook effect skipped');
  }
  return checked;
}

/**
 * Runs the hooks of a trigger and their cascade, breadth-first. A trigger's
 * effects are solved once, right after it; its field updates are applied
 * leniently, then its transitions are queued in atom order. Each queued
 * transition is applied leniently, then its own hooks run. A (card,
 * transition) pair runs at most once per user operation, counting the
 * triggering transitions.
 *
 * Never throws: an effect that cannot be applied is logged and skipped.
 * Runs inside a write.
 * @param visited The (card, transition) pairs the user operation has run;
 *   one set for every trigger of the operation.
 */
export async function runHooks(
  checkout: Checkout,
  trigger: Trigger,
  visited = new Set<string>(),
): Promise<void> {
  const pair = (card: string, transition: string) => `${card}:${transition}`;
  if (trigger.kind === 'transition') {
    visited.add(pair(trigger.card, trigger.transition));
  }
  // Each queued transition, what it sets off and the trigger whose hook
  // asked for it.
  const queue: {
    trigger: Trigger;
    effect: CheckedEffect;
    next: Extract<Trigger, { kind: 'transition' }>;
  }[] = [];

  const consume = async (trigger: Trigger) => {
    const updates: CheckedEffect[] = [];
    for (const effect of await hookEffects(checkout, trigger)) {
      const next = effect.trigger?.([]);
      if (next?.kind === 'transition') {
        queue.push({ trigger, effect, next });
      } else {
        updates.push(effect);
      }
    }
    await applyEffects(checkout, updates, lenient(trigger));
  };

  await consume(trigger);
  while (queue.length > 0) {
    const { trigger, effect, next } = queue.shift()!;
    const key = pair(next.card, next.transition);
    if (visited.has(key)) {
      logger.warn(
        { trigger, atom: effect.atom },
        'Hook transition already run in this operation; check module calculations for cycles',
      );
      continue;
    }
    visited.add(key);
    await applyEffects(checkout, [effect], {
      ...lenient(trigger),
      afterTrigger: consume,
    });
  }
}
