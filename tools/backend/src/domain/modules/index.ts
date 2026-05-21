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
import { applyModuleUpdate, previewModuleUpdate } from './service.js';
import {
  ApplyUpdateRequestSchema,
  PreviewUpdateRequestSchema,
} from './schema.js';

const modules = new Hono<{ Variables: AppVars }>();

modules.post(
  '/update/preview',
  requireRole(UserRole.Admin),
  zValidator('json', PreviewUpdateRequestSchema, (result, c) => {
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
    const { module, toVersion } = c.req.valid('json');
    const commands = c.get('commands');
    try {
      const preview = await previewModuleUpdate(commands, module, toVersion);
      return c.json(preview);
    } catch (err) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: (err as Error).message,
        }),
        400,
      );
    }
  },
);

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
      try {
        const preview = await previewModuleUpdate(
          commands,
          modulePrefix,
          toVersion,
        );
        if (preview.conflicts.length > 0) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify(
              errorResponse({
                code: 'update_conflict',
                message: 'Conflicts detected; cannot apply.',
                details: { conflicts: preview.conflicts },
              }),
            ),
          });
          return;
        }

        // Emit step.started for each step before applying.
        for (const step of preview.steps) {
          await stream.writeSSE({
            event: 'step.started',
            data: JSON.stringify(step),
          });
        }

        const result = await applyModuleUpdate(commands, preview);

        // Emit step.completed / step.failed per result.
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
      }
    });
  },
);

export default modules;
