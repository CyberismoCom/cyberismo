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

// Body schema for update operation-based resource update
export const updateOperationBodySchema = z.object({
  key: z.string(),
  operation: z.discriminatedUnion('name', [
    z.object({
      name: z.literal('add'),
      target: z.unknown(),
    }),
    z.object({
      name: z.literal('change'),
      target: z.unknown(),
      to: z.unknown(),
      mappingTable: z
        .object({
          stateMapping: z.record(z.string(), z.string()),
        })
        .optional(),
    }),
    z.object({
      name: z.literal('remove'),
      target: z.unknown(),
    }),
    z.object({
      name: z.literal('rank'),
      target: z.unknown(),
      newIndex: z.number(),
    }),
  ]),
});

export type UpdateOperationBody = z.infer<typeof updateOperationBodySchema>;
