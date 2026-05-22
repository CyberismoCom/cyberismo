/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import type { AppVars } from '../../types.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';
import { errorResponse } from '../../common/errors.js';
import { applyModuleUpdate } from './service.js';
import { ApplyUpdateRequestSchema } from './schema.js';

const modules = new Hono<{ Variables: AppVars }>();

// Note: there is no `/update/preview` route. A preview of a not-yet-installed
// version cannot be produced without first fetching the target's sealed
// migration logs, which only ship inside the target tarball. Until that
// flow is built, the apply route runs install + replay as one operation
// and streams per-step results once they're known.
modules.post(
  '/update',
  requireRole(UserRole.Admin),
  zValidator('json', ApplyUpdateRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: 'Invalid request body',
          details: z.prettifyError(result.error),
        }),
        400,
      );
    }
  }),
  async (c) => {
    const { module: modulePrefix, toVersion } = c.req.valid('json');
    const commands = c.get('commands');

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'started',
        data: JSON.stringify({ modulePrefix, toVersion }),
      });

      let result;
      try {
        result = await applyModuleUpdate(commands, modulePrefix, toVersion);
      } catch (err) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify(
            errorResponse({
              code: 'cascade_failed',
              message: (err as Error).message,
            }),
          ),
        });
        return;
      }

      if (result === null) {
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ status: 'succeeded', steps: [] }),
        });
        return;
      }

      // Per-step events: only known after `Import.updateModule` returns,
      // because the transitive plan is computed inside the install half.
      for (const stepResult of result.steps) {
        await stream.writeSSE({
          event:
            stepResult.status === 'succeeded'
              ? 'step.completed'
              : 'step.failed',
          data: JSON.stringify(stepResult),
        });
      }

      if (result.status === 'succeeded') {
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify(result),
        });
      } else {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify(
            errorResponse({
              code: 'cascade_failed',
              message: result.failureSummary ?? 'Update failed.',
              details: { result },
            }),
          ),
        });
      }
    });
  },
);

export default modules;
