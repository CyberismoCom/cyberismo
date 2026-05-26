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

import { readFile } from 'node:fs/promises';

import type { Project } from '../../containers/project.js';
import { ResourceMutations } from '../plan.js';
import type { MutationInput } from '../types.js';
import { resourceName } from '../../utils/resource-utils.js';
import type { ConfigurationLogEntry } from '../../utils/configuration-logger.js';
import type { Operation } from '../../resources/resource-object.js';
import type { StepReplayResult } from './types.js';

/**
 * Replay all entries from a sealed migration log against `project`.
 *
 * Each entry is dispatched through the existing `ResourceMutations.apply`
 * pipeline. Replay deliberately bypasses fingerprinting: the consumer's
 * state may legitimately differ from the author's, and the cascade is
 * tolerant by design. Stops on the first failure and reports the offending
 * sequence number.
 */
export async function replayLog(
  project: Project,
  logPath: string,
): Promise<StepReplayResult> {
  const content = await readFile(logPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  const mutations = new ResourceMutations(project);
  let sequence = 0;

  for (const line of lines) {
    sequence += 1;
    let entry: ConfigurationLogEntry;
    try {
      entry = JSON.parse(line) as ConfigurationLogEntry;
    } catch (err) {
      return {
        modulePrefix: '',
        fromVersion: null,
        toVersion: '',
        status: 'failed',
        failedAtSequence: sequence,
        failureSummary: `Malformed log entry at line ${sequence}: ${(err as Error).message}`,
      };
    }

    let input: MutationInput;
    try {
      input = entryToMutationInput(entry);
    } catch (err) {
      return {
        modulePrefix: '',
        fromVersion: null,
        toVersion: '',
        status: 'failed',
        failedAtSequence: sequence,
        failureSummary: (err as Error).message,
      };
    }

    try {
      // Bypass the fingerprint guard: replay is unconditional. The consumer's
      // state may legitimately differ from the author's, and the cascade is
      // tolerant by design.
      await mutations.apply(input, { bypassFingerprint: true });
    } catch (err) {
      return {
        modulePrefix: '',
        fromVersion: null,
        toVersion: '',
        status: 'failed',
        failedAtSequence: sequence,
        failureSummary: (err as Error).message,
      };
    }
  }

  return {
    modulePrefix: '',
    fromVersion: null,
    toVersion: '',
    status: 'succeeded',
  };
}

function entryToMutationInput(entry: ConfigurationLogEntry): MutationInput {
  switch (entry.kind) {
    case 'resource_edit': {
      const payload = entry.payload as {
        key: string;
        operation: Operation<unknown>;
      };
      return {
        kind: 'edit',
        target: resourceName(entry.target),
        updateKey: { key: payload.key },
        operation: payload.operation,
      };
    }
    case 'resource_delete':
      return { kind: 'delete', target: resourceName(entry.target) };
    case 'resource_rename': {
      const payload = entry.payload as { newName: string };
      const newName = resourceName(payload.newName);
      return {
        kind: 'rename',
        target: resourceName(entry.target),
        newIdentifier: newName.identifier,
      };
    }
    case 'project_rename': {
      const payload = entry.payload as { newPrefix: string };
      return { kind: 'project_rename', newPrefix: payload.newPrefix };
    }
    default:
      throw new Error(`Unknown migration entry kind: ${entry.kind}`);
  }
}
