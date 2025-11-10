import type { Next } from 'hono';
import type { AppContext, TreeOptions } from '../types.js';

/**
 * Injects tree options into the context for each request
 * @param opts Options to inject
 * @returns Middleware function
 */
const treeMiddleware =
  (opts?: TreeOptions) => async (c: AppContext, next: Next) => {
    if (opts) {
      c.set('tree', { recursive: opts.recursive, cardKey: opts.cardKey });
    }
    await next();
  };

export default treeMiddleware;
