import { z } from 'zod';
import {
  resourceParamsSchema,
  resourceTypes,
} from '../../common/validationSchemas.js';

export const resourceFileParamsSchema = resourceParamsSchema.extend({
  file: z.string(),
});

export type ResourceFileParams = z.infer<typeof resourceFileParamsSchema>;

export const validateResourceParamsSchema = resourceParamsSchema.extend({
  type: z.enum(resourceTypes.filter((type) => type !== 'calculations')),
});

export type ValidateResourceParams = z.infer<
  typeof validateResourceParamsSchema
>;
