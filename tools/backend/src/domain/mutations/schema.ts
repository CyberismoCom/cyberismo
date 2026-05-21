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

const ResourceNameSchema = z.object({
  prefix: z.string(),
  type: z.string(),
  identifier: z.string(),
});

const OperationSchema = z.object({
  name: z.enum(['add', 'change', 'rank', 'remove']),
  target: z.unknown().optional(),
  to: z.unknown().optional(),
  newIndex: z.number().optional(),
  replacementValue: z.unknown().optional(),
  mappingTable: z
    .object({ stateMapping: z.record(z.string(), z.string()) })
    .optional(),
});

const UpdateKeySchema = z.object({
  key: z.string(),
  subKey: z.string().optional(),
});

export const MutationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edit'),
    target: ResourceNameSchema,
    updateKey: UpdateKeySchema,
    operation: OperationSchema,
  }),
  z.object({ kind: z.literal('delete'), target: ResourceNameSchema }),
  z.object({
    kind: z.literal('rename'),
    target: ResourceNameSchema,
    newIdentifier: z.string(),
  }),
  z.object({ kind: z.literal('project_rename'), newPrefix: z.string() }),
]);

export const FingerprintSchema = z.object({ digest: z.string() });

export const PreviewRequestSchema = z.object({
  input: MutationInputSchema,
});

export const ApplyRequestSchema = z.object({
  input: MutationInputSchema,
  fingerprint: FingerprintSchema.optional(),
});

export const CascadePreviewSchema = z.object({
  affectedCardCount: z.number(),
  affectedLinkCount: z.number(),
  affectedCalculationCount: z.number(),
  affectedHandlebarFileCount: z.number(),
  dataLossExpected: z.boolean(),
  summary: z.string(),
});

export const PreviewResultSchema = z.object({
  input: MutationInputSchema,
  isBreaking: z.boolean(),
  preview: CascadePreviewSchema,
  fingerprint: FingerprintSchema,
});
