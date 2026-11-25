// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { copyContent, setContent } from './content.js';
import type { EffectKind } from './define.js';
import { addLabel, removeLabel } from './label.js';
import { addLink, removeLink } from './link.js';
import { rank, rankFirst } from './rank.js';
import { setField } from './setField.js';

/** Every kind of effect an action program may derive. */
export const EFFECTS: readonly EffectKind[] = [
  setField,
  setContent,
  copyContent,
  addLabel,
  removeLabel,
  addLink,
  removeLink,
  rank,
  rankFirst,
];
