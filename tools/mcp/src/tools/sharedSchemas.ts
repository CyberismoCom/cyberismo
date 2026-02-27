import { z } from 'zod';

export const resourceNameRegex = (...types: string[]) =>
  new RegExp(`^[^/]+/(${types.join('|')})/[^/]+$`);

export const BASE_PROPERTY_KEYS = [
  'name',
  'displayName',
  'description',
  'category',
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

export const changeOperationSchema = z.object({
  name: z
    .literal('change')
    .describe(
      'Set or update a scalar property, or replace an item in an array',
    ),
  target: z.unknown().describe('Target value for the operation'),
  to: z.unknown().describe('New value for the item being changed'),
});
const addOperationSchema = z.object({
  name: z.literal('add').describe('Add a new item to an array'),
  target: z.unknown().describe('Target value for the operation'),
});
const rankOperationSchema = z.object({
  name: z.literal('rank').describe('Reorder an item within an array property'),
  target: z.unknown().describe('Target value for the operation'),
  newIndex: z.number().describe('New index for the item being ranked'),
});
const removeOperationSchema = z.object({
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
