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
