import { z } from 'zod';

export const createCardTypeSchema = z.object({
  identifier: z.string().min(1),
  workflowName: z.string(),
});
