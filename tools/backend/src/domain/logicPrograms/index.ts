/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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

import { resourceParamsWithCard } from '../../common/validationSchemas.js';
import * as logicProgramService from './service.js';

const router = new Hono();

router.get(
  '/:prefix/:type/:identifier',
  zValidator('param', resourceParamsWithCard),
  async (c) => {
    const commands = c.get('commands');
    const params = c.req.valid('param');
    const logicProgram = await logicProgramService.getLogicProgram(
      commands,
      params,
    );
    return c.json({ logicProgram });
  },
);

export default router;
