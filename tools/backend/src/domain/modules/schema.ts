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
import { z } from 'zod';

export const PreviewUpdateRequestSchema = z.object({
  module: z.string(),
  toVersion: z.string(),
});

export const ApplyUpdateRequestSchema = z.object({
  module: z.string(),
  toVersion: z.string(),
});

const ReplayConflictSchema = z.object({
  kind: z.enum([
    'local_reference_unrewritable',
    'migration_path_unreachable',
    'other',
  ]),
  affected: z.string(),
  location: z.string(),
  description: z.string(),
  suggestedTargetVersion: z.string().optional(),
  suggestedIntermediateVersions: z.array(z.string()),
});

const ResolvedUpdateStepSchema = z.object({
  order: z.number(),
  modulePrefix: z.string(),
  fromVersion: z.string().nullable(),
  toVersion: z.string(),
  logChain: z.array(z.string()),
  crossesMajorBoundary: z.boolean(),
});

export const ModuleUpdatePreviewSchema = z.object({
  steps: z.array(ResolvedUpdateStepSchema),
  conflicts: z.array(ReplayConflictSchema),
  totalEntryCount: z.number(),
  affectedCardCount: z.number(),
  dataLossExpected: z.boolean(),
});
