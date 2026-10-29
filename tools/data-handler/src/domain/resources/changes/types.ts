// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MutationInput } from '@cyberismo/model';

export type MutationKind =
  | 'create' // whole-resource create
  | 'edit' // sub-property add/change/rank/remove
  | 'delete' // whole-resource delete
  | 'rename'; // whole-resource rename

export type CreateInput = Extract<MutationInput, { kind: 'create' }>;
export type EditInput = Extract<MutationInput, { kind: 'edit' }>;
export type DeleteInput = Extract<MutationInput, { kind: 'delete' }>;
export type RenameInput = Extract<MutationInput, { kind: 'rename' }>;
