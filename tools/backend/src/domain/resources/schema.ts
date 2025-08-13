import { z } from 'zod';

export const resourceParamsSchema = z.object({
  prefix: z.string(),
  type: z.enum([
    'graphModels',
    'graphViews',
    'reports',
    'templates',
    'workflows',
    'calculations',
    'cardTypes',
    'fieldTypes',
    'linkTypes',
  ]),
  identifier: z.string(),
});

export type ResourceParams = z.infer<typeof resourceParamsSchema>;

export const resourceFileParamsSchema = resourceParamsSchema.extend({
  file: z.string(),
});

export type ResourceFileParams = z.infer<typeof resourceFileParamsSchema>;
