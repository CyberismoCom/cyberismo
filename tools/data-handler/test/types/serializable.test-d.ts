/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// Type test: checked by `tsc -p tsconfig.types.json`, never run.
// Every façade method takes and returns only JSON-serialisable data
// (Uint8Array allowed for bytes): no functions, class instances or Dates.

import type { Cards } from '../../src/cards/cards.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => unknown;

// `false` somewhere in the union when T is not serialisable. A recursive type
// (a card's childrenCards) is trusted below the depth D counts down from.
type Check<T, D extends unknown[] = []> = D['length'] extends 6
  ? true
  : T extends string | number | bigint | boolean | null | undefined | void
    ? true
    : T extends Uint8Array
      ? true
      : T extends AnyFunction
        ? false
        : T extends readonly (infer U)[]
          ? Check<U, [...D, 0]>
          : T extends object
            ? { [K in keyof T]-?: Check<T[K], [...D, 0]> }[keyof T]
            : false;

export type Serializable<T> = false extends Check<T> ? false : true;

type MethodKeys<F> = {
  [K in keyof F]: F[K] extends AnyFunction ? K : never;
}[keyof F];

// Per method: its parameters and awaited result are serialisable.
type FacadeSerializable<F> = {
  [K in MethodKeys<F>]: F[K] extends (...args: infer P) => infer R
    ? Serializable<P> extends true
      ? Serializable<Awaited<R>>
      : false
    : false;
};

// The check itself rejects what it should.
export const rejects: [
  Serializable<{ at: Date }>,
  Serializable<() => void>,
  Serializable<Map<string, string>>,
] = [false, false, false];

export const cards: FacadeSerializable<Cards> = {
  move: true,
  rank: true,
  rankFirst: true,
  rankAt: true,
  rebalance: true,
  rebalanceAll: true,
  edit: true,
  editField: true,
  transition: true,
  remove: true,
  addLabel: true,
  removeLabel: true,
  addLink: true,
  removeLink: true,
  addAttachment: true,
  removeAttachment: true,
  renameAttachment: true,
  create: true,
  addToTemplate: true,
  list: true,
  details: true,
  has: true,
  roots: true,
  templateCards: true,
  attachments: true,
  attachment: true,
  labels: true,
  logicProgram: true,
};
