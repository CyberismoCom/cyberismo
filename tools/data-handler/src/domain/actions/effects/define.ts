// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ROOT } from '../../../shared/utils/constants.js';
import type { Checkout } from '../../../state/checkout/checkout.js';
import type { CreatedCard } from '../facts.js';

/**
 * The steps effects are applied in. Within a step, effects are applied in
 * the order of their atoms.
 */
export const STEPS = [
  'create',
  'move',
  'fields',
  'unlink',
  'link',
  'transition',
  'rank',
] as const;
export type Step = (typeof STEPS)[number];

/** The parent of a new or moved card. */
export type CardRef = { kind: 'card'; key: string } | { kind: 'root' };

/**
 * What an argument of an effect is: a card key, a text (a name or a
 * string), a field value (null when the program writes the constant null),
 * a term kept as written, or a parent (a card key or root).
 */
export type Role = 'card' | 'text' | 'value' | 'term' | 'parent';

/**
 * One argument of an effect. An optional argument may be left out, which
 * gives the effect a second, shorter form; an argument with a default takes
 * the default when left out.
 */
export type Arg =
  Role | { role: Role; optional: true } | { role: Role; default: string };

/**
 * The arguments of an effect by name, in the order they are written.
 * Optional arguments and arguments with a default come last.
 */
export type ArgSpec = Readonly<Record<string, Arg>>;

type Of<R extends Role> = R extends 'parent'
  ? CardRef
  : R extends 'value'
    ? string | null
    : string;

/** The arguments of one effect as its definition takes them. */
export type Args<S extends ArgSpec> = {
  readonly [K in keyof S]: S[K] extends Role
    ? Of<S[K]>
    : S[K] extends { role: infer R extends Role; optional: true }
      ? Of<R> | undefined
      : S[K] extends { role: infer R extends Role }
        ? Of<R>
        : never;
};

/**
 * What an effect changes. Effects of one program with the same `on` are
 * about one thing, and conflict when their values differ: every one of them
 * is refused.
 */
export interface Conflict {
  on: readonly (string | null)[];
  /** Absent: any two effects with the same `on` conflict. */
  value?: string;
  /** A second effect with the same value is left out. */
  once?: true;
  reason: string;
}

/**
 * One kind of effect: its arguments, its check and how it is applied.
 * `check` comes first in a definition, as its result is the type of
 * `checked` in the members after it.
 */
export interface EffectDefinition<S extends ArgSpec, C> {
  name: string;
  args: S;
  step: Step;
  /**
   * Checks the effect alone and refuses it with refuse(). What it returns
   * is given to the members below.
   */
  check(checkout: Checkout, e: Args<S>): C;
  conflict?(e: Args<S>, checked: C): Conflict;
  /** Applies the effect; returns the cards it created, if it creates. */
  apply(
    checkout: Checkout,
    e: Args<S>,
    checked: C,
  ): Promise<CreatedCard[] | void>;
}

/** One effect a program derived, as its row gives it: not yet checked. */
export interface EffectRow {
  kind: EffectKind;
  /** The effect as the program wrote it. */
  atom: string;
  /**
   * The effect's arguments by name, as text; a value argument that is the
   * constant null is null.
   */
  values: Readonly<Record<string, string | null | undefined>>;
}

/** A kind of effect as the generic code sees it. */
export interface EffectKind {
  readonly name: string;
  readonly args: ArgSpec;
  readonly step: Step;
  /**
   * Reads the arguments of an effect of the kind and checks it alone;
   * refuses by throwing.
   */
  check(checkout: Checkout, row: EffectRow): CheckedEffect;
}

/** An effect that passed its check, ready to be applied. */
export interface CheckedEffect {
  readonly atom: string;
  readonly step: Step;
  readonly conflict?: Conflict;
  apply(checkout: Checkout): Promise<CreatedCard[]>;
}

/** Why an effect is refused. */
export class Refused extends Error {}

/** Refuses the effect being checked. */
export function refuse(reason: string): never {
  throw new Refused(reason);
}

// The arguments of a row by role. A row without an argument its effect
// needs is refused.
function argsOf(spec: ArgSpec, row: EffectRow): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [name, arg] of Object.entries(spec)) {
    const text = row.values[name];
    if (text === undefined) {
      if (typeof arg === 'string' || !('optional' in arg)) {
        refuse(`the effect has no ${name}`);
      }
      args[name] = undefined;
      continue;
    }
    const role = typeof arg === 'string' ? arg : arg.role;
    args[name] =
      role !== 'parent' || text === null
        ? text
        : text === ROOT
          ? { kind: 'root' }
          : { kind: 'card', key: text };
  }
  return args;
}

/**
 * Makes a kind of effect from its definition. The definition is typed by
 * its own arguments; the kind is what the generic code runs.
 */
export function defineEffect<const S extends ArgSpec, C>(
  definition: EffectDefinition<S, C>,
): EffectKind {
  const { name, args, step } = definition;
  return {
    name,
    args,
    step,
    check(checkout, row) {
      const e = argsOf(args, row) as Args<S>;
      const checked = definition.check(checkout, e);
      return {
        atom: row.atom,
        step,
        conflict: definition.conflict?.(e, checked),
        apply: async (checkout) =>
          (await definition.apply(checkout, e, checked)) ?? [],
      };
    },
  };
}
