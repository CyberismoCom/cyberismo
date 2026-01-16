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
import { zValidator } from '../../middleware/zvalidator.js';
import { moduleParamSchema, updateProjectSchema } from './schema.js';
import * as projectService from './service.js';

const router = new Hono();

router.get('/', async (c) => {
  const commands = c.get('commands');

  const project = await projectService.getProject(commands);
  return c.json(project);
});

router.patch('/', zValidator('json', updateProjectSchema), async (c) => {
  const commands = c.get('commands');
  const updates = c.req.valid('json');

  const project = await projectService.updateProject(commands, updates);
  return c.json(project);
});

router.post('/modules/update', async (c) => {
  const commands = c.get('commands');
  await projectService.updateAllModules(commands);
  return c.json({ message: 'All modules updated' });
});

router.post(
  '/modules/:module/update',
  zValidator('param', moduleParamSchema),
  async (c) => {
    const commands = c.get('commands');
    const { module } = c.req.valid('param');
    await projectService.updateModule(commands, module);
    return c.json({ message: 'Module updated' });
  },
);

router.delete(
  '/modules/:module',
  zValidator('param', moduleParamSchema),
  async (c) => {
    const commands = c.get('commands');
    const { module } = c.req.valid('param');
    await projectService.deleteModule(commands, module);
    return c.json({ message: 'Module removed' });
  },
);

export default router;
