import { zValidator as zv } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import type { ValidationTargets } from 'hono';
import { z } from 'zod';

export const zValidator = <
  T extends ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: z.prettifyError(result.error) }, 400);
    }
  });
