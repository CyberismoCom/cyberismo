import { z } from 'zod';

export const createFieldTypeSchema = z.object({
  dataType: z.enum([
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
  ]),
  identifier: z.string().min(1),
});
