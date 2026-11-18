// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

export const resourceNameRegex = (...types: string[]) =>
  new RegExp(`^[^/]+/(${types.join('|')})/[^/]+$`);

export const BASE_PROPERTY_KEYS = [
  'name',
  'displayName',
  'description',
  'category',
] as const;

export const SUB_PROPERTY_KEYS = [
  'calculation',
  'contentTemplate',
  'model',
  'queryTemplate',
  'viewTemplate',
  'schema',
] as const;

export const DATA_TYPES = [
  'boolean',
  'date',
  'dateTime',
  'enum',
  'integer',
  'list',
  'longText',
  'number',
  'person',
  'shortText',
] as const;

export const changeOperationSchema = z.strictObject({
  name: z
    .literal('change')
    .describe(
      'Set or update a scalar property, or replace an item in an array',
    ),
  target: z
    .unknown()
    .describe(
      'For array properties, the existing item to replace. Unused for scalar properties',
    ),
  to: z.unknown().describe('New value for the property or replaced item'),
  mappingTable: z
    .strictObject({
      stateMapping: z.record(z.string(), z.string()),
    })
    .optional(),
});
const addOperationSchema = z.strictObject({
  name: z.literal('add').describe('Add a new item to an array'),
  target: z.unknown().describe('Target value for the operation'),
});
const rankOperationSchema = z.strictObject({
  name: z.literal('rank').describe('Reorder an item within an array property'),
  target: z.unknown().describe('Target value for the operation'),
  newIndex: z.number().describe('New index for the item being ranked'),
});
const removeOperationSchema = z.strictObject({
  name: z.literal('remove').describe('Remove an item from an array property'),
  target: z.unknown().describe('Target value for the operation'),
  replacementValue: z.unknown().optional(),
});
export const arrayUpdateOperationSchema = z.union([
  addOperationSchema,
  changeOperationSchema,
  rankOperationSchema,
  removeOperationSchema,
]);

// 'change' on a folder resource content file. The file is replaced as a
// whole; target is only an optional check of the current content.
export const contentChangeOperationSchema = z.strictObject({
  name: z
    .literal('change')
    .describe('Replace the ENTIRE content of the file with `to`'),
  to: z
    .unknown()
    .describe(
      'Complete new content of the file (a string; for schema also a JSON object). It replaces the whole file: partial edits are not supported, so include every line that should remain',
    ),
  target: z
    .unknown()
    .optional()
    .describe(
      'Optional safety check: the complete current content of the file. If given and it differs from the file, nothing is written. It does not select a part of the file to replace',
    ),
});
