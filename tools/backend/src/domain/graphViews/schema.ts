import { z } from 'zod';
import { identifierSchema } from '../../common/validationSchemas.js';

export const createGraphViewSchema = z.object({
  identifier: identifierSchema,
});
