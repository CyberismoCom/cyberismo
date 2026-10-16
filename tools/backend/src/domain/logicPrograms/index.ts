// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';

import { zValidator } from '../../middleware/zvalidator.js';
import { resourceParamsWithCard } from '../../common/validationSchemas.js';
import * as logicProgramService from './service.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

router.get(
  '/:prefix/:type/:identifier',
  requireRole(UserRole.Reader),
  zValidator('param', resourceParamsWithCard),
  async (c) => {
    const ws = c.get('ws');
    const params = c.req.valid('param');
    const logicProgram = await logicProgramService.getLogicProgram(ws, params);
    return c.json({ logicProgram });
  },
);

export default router;
