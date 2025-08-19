import { z } from 'zod';

export const createGraphViewSchema = z.object({
  identifier: z.string().min(1),
});
