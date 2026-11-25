// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Type test: checked by `tsc -p tsconfig.types.json`, never run.
// defineEffect reads an effect's arguments out of its row and casts them to
// the type its definition's argument spec gives. This pins that type for
// each kind of argument, and that a definition's later members get what its
// check returns.

import {
  defineEffect,
  type CardRef,
} from '../../../src/domain/actions/effects/define.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

export const example = defineEffect({
  name: 'example',
  args: {
    card: 'card',
    name: 'text',
    value: 'value',
    id: { role: 'term', default: 'none' },
    parent: 'parent',
    description: { role: 'text', optional: true },
    under: { role: 'parent', optional: true },
  },
  step: 'fields',
  check(checkout, e) {
    const args: Equal<
      typeof e,
      {
        readonly card: string;
        readonly name: string;
        readonly value: string | null;
        readonly id: string;
        readonly parent: CardRef;
        readonly description: string | undefined;
        readonly under: CardRef | undefined;
      }
    > = true;
    return args ? e.card : checkout.basePath;
  },
  conflict(e, checked) {
    const result: Equal<typeof checked, string> = true;
    return { on: [e.card], reason: result ? checked : '' };
  },
  async apply() {},
});
