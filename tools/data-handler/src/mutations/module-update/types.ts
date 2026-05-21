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

export type ReplayConflictKind =
  | 'local_reference_unrewritable'
  | 'migration_path_unreachable'
  | 'other';

export interface ReplayConflict {
  kind: ReplayConflictKind;
  affected: string; // resource name or file path
  location: string; // where the conflict surfaced
  description: string;
  /** When the conflict can be resolved by moving to a different target. */
  suggestedTargetVersion?: string;
  /** When the consumer should traverse an explicit chain to reach the target. */
  suggestedIntermediateVersions: string[];
}

export interface ResolvedUpdateStep {
  order: number;
  modulePrefix: string;
  fromVersion: string | null; // null = bootstrap (new transitive dep)
  toVersion: string;
  /** Versions strictly between fromVersion and toVersion (inclusive of toVersion) that have sealed log files. */
  logChain: string[];
  crossesMajorBoundary: boolean;
}

export interface ModuleUpdatePreview {
  steps: ResolvedUpdateStep[];
  conflicts: ReplayConflict[];
  /** Summary across all steps. */
  totalEntryCount: number;
  affectedCardCount: number;
  dataLossExpected: boolean;
}

export interface StepReplayResult {
  modulePrefix: string;
  fromVersion: string | null;
  toVersion: string;
  status: 'succeeded' | 'failed';
  failedAtSequence?: number;
  failureSummary?: string;
}

export interface ModuleUpdateResult {
  status: 'succeeded' | 'failed';
  steps: StepReplayResult[];
  failedAtStep?: number;
  failureSummary?: string;
}
