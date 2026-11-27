// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { decodeClingoValue } from '../../infra/engine/clingo-parser.js';
import { LogicInvalidError } from '../../infra/logic/logic-backend.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import type { Arg, EffectKind, EffectRow } from './effects/define.js';
import { compareText } from './order.js';

// Effects reach the code as rows of a query result: actionEffect(E, Name)
// holds each effect term with the name of its kind, the row's key is the
// term as text, and each argument is a field of the row.
const FRAME = `result(action).
childResult(action, @concatenate(E), Name) :- actionEffect(E, Name).`;

// The variable an argument is written as in a rule.
const variable = (name: string) => name[0].toUpperCase() + name.slice(1);

// Whether an argument of a kind is written in an effect term of which the
// first `given` arguments are given: one left out is written as its
// default, if it has one.
const written = (arg: Arg, index: number, given: number) =>
  index < given || (typeof arg !== 'string' && 'default' in arg);

// The effect term of a kind with its first `given` arguments as variables.
function termOf(kind: EffectKind, given: number): string {
  const args = Object.entries(kind.args)
    .filter(([, arg], index) => written(arg, index, given))
    .map(([name, arg], index) =>
      index < given || typeof arg === 'string' || !('default' in arg)
        ? variable(name)
        : arg.default,
    );
  return `${kind.name}(${args.join(',')})`;
}

// How many arguments an effect of the kind may be written with: optional
// arguments and arguments with a default may be left out.
function arities(kind: EffectKind): number[] {
  const args = Object.values(kind.args);
  const required = args.filter((arg) => typeof arg === 'string').length;
  return Array.from(
    { length: args.length - required + 1 },
    (_, index) => required + index,
  );
}

// A rule that derives effects of a kind from a body that binds the first
// `given` of their arguments, as the variables named after them.
const rule = (kind: EffectKind, given: number, body: string) =>
  `actionEffect(${termOf(kind, given)}, "${kind.name}") :- ${body}.`;

/**
 * A rule that derives effects of a kind from a body. In the body, the
 * effect's arguments are the variables named after them, capitalised.
 */
export const effectRule = (kind: EffectKind, body: string) =>
  rule(kind, Object.keys(kind.args).length, body);

// The field of a row that tells that a value argument is the constant null,
// which as text would read the same as the string "null".
const nullField = (name: string) => `${name}IsNull`;

// The rules that give each argument of a kind's effects as a field of its
// row: a set of rules for each number of arguments an effect term has.
function fieldRules(kind: EffectKind): string[] {
  const args = Object.entries(kind.args);
  const lengths = new Set(
    arities(kind).map(
      (given) =>
        args.filter(([, arg], index) => written(arg, index, given)).length,
    ),
  );
  return [...lengths].flatMap((length) =>
    args.slice(0, length).flatMap(([name, arg]) => {
      const given = `actionEffect(E, "${kind.name}"), E = ${termOf(kind, length)}`;
      const field = `resultField(@concatenate(E), "${name}", ${variable(name)}, "shortText") :- ${given}.`;
      return (typeof arg === 'string' ? arg : arg.role) === 'value'
        ? [
            field,
            `resultField(@concatenate(E), "${nullField(name)}", "true", "shortText") :- ${given}, ${variable(name)} = null.`,
          ]
        : [field];
    }),
  );
}

// The rules that make an effect of every atom named and written like one.
function collectRules(kind: EffectKind): string[] {
  const names = Object.keys(kind.args).map(variable);
  return arities(kind).map((given) =>
    rule(kind, given, `${kind.name}(${names.slice(0, given).join(',')})`),
  );
}

/**
 * Solves a logic program and reads the effects it derives. Inside a write
 * it sees the write's changes.
 * @param text The program.
 * @param kinds The kinds of effect to read.
 * @param collect Whether the text is a program of an action: its atoms
 *   named and written like an effect are then effects, and its failure is
 *   the request's own.
 * @returns the effects in the order of their atoms
 * @throws LogicError as the program fails: invalid, non-total or unavailable
 */
export async function solveEffects(
  checkout: Checkout,
  text: string,
  kinds: readonly EffectKind[],
  collect: boolean,
): Promise<EffectRow[]> {
  const rules = [
    FRAME,
    ...kinds.flatMap(fieldRules),
    ...(collect ? kinds.flatMap(collectRules) : []),
  ];
  // The text comes last, so a #program in it switches off only the rules
  // that follow it there.
  const { results, error } = await checkout.calculationEngine.runLogicProgram(
    `${rules.join('\n')}\n${text}`,
    'localApp',
    collect,
  );
  if (error) {
    throw collect ? new LogicInvalidError(error) : new Error(error);
  }
  const effects: EffectRow[] = [];
  for (const result of results) {
    for (const kind of kinds) {
      const rows = result[kind.name];
      if (!Array.isArray(rows)) continue;
      for (const row of rows as Record<string, unknown>[]) {
        const values: Record<string, string | null | undefined> = {};
        for (const name of Object.keys(kind.args)) {
          const value = row[name];
          values[name] =
            row[nullField(name)] !== undefined
              ? null
              : typeof value === 'string'
                ? value
                : undefined;
        }
        effects.push({
          kind,
          atom: decodeClingoValue(String(row.key)),
          values,
        });
      }
    }
  }
  return effects.sort((a, b) => compareText(a.atom, b.atom));
}
