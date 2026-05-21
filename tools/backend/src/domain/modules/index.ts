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
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import type { AppVars } from '../../types.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';
import { errorResponse } from '../../common/errors.js';
import { previewModuleUpdate } from './service.js';
import { PreviewUpdateRequestSchema } from './schema.js';

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

export default modules;
