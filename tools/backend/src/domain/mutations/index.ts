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
import type { MutationInput } from '@cyberismo/data-handler/mutations/types';

import type { AppVars } from '../../types.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';
import { errorResponse } from '../../common/errors.js';
import { previewMutation } from './service.js';
import { PreviewRequestSchema } from './schema.js';

const mutations = new Hono<{ Variables: AppVars }>();

mutations.post(
  '/preview',
  requireRole(UserRole.Admin),
  zValidator('json', PreviewRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        errorResponse({
          code: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        }),
        400,
      );
    }
  }),
  async (c) => {
    const { input } = c.req.valid('json');
    const commands = c.get('commands');
    try {
      const result = await previewMutation(commands, input as MutationInput);
      return c.json(result);
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

export default mutations;
