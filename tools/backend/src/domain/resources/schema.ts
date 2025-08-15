import { z } from 'zod';
import { resourceParamsSchema } from '../../common/validationSchemas.js';

export const resourceFileParamsSchema = resourceParamsSchema.extend({
  file: z.string(),
});

export type ResourceFileParams = z.infer<typeof resourceFileParamsSchema>;
