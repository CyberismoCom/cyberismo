/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { CommandManager } from '@cyberismo/data-handler';
import { ResourceMutations } from '@cyberismo/data-handler/mutations/plan';
import type {
  ApplyResult,
  MutationFingerprint,
  MutationInput,
  PreviewResult,
} from '@cyberismo/data-handler/mutations/types';

export async function previewMutation(
  commands: CommandManager,
  input: MutationInput,
): Promise<PreviewResult> {
  const mutations = new ResourceMutations(commands.project);
  return mutations.plan(input);
}

export async function applyMutation(
  commands: CommandManager,
  input: MutationInput,
  fingerprint?: MutationFingerprint,
): Promise<ApplyResult> {
  const mutations = new ResourceMutations(commands.project);
  return mutations.apply(input, { fingerprint });
}
