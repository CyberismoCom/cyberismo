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
import {
  addHubSchema,
  cleanSchema,
  deploymentSettingsPatchSchema,
  importModuleSchema,
  moduleParamSchema,
  removeHubSchema,
  updateProjectSchema,
} from './schema.js';
import * as projectService from './service.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

router.get('/', requireRole(UserRole.Reader), async (c) => {
  const commands = c.get('commands');

  const project = await projectService.getProject(commands);
  return c.json({
    ...project,
    deployment: c.get('registry').deploymentSettings(c.get('projectPrefix')),
  });
});

/**
 * Patch this project's deployment settings — read-only mode today, more later.
 * Admin only, and admins are not downgraded by read-only mode, so this stays
 * reachable once the mode is on.
 */
router.patch(
  '/deployment-settings',
  requireRole(UserRole.Admin),
  zValidator('json', deploymentSettingsPatchSchema),
  async (c) => {
    const settings = c
      .get('registry')
      .updateDeploymentSettings(c.get('projectPrefix'), c.req.valid('json'));
    return c.json(settings);
  },
);

router.patch(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', updateProjectSchema),
  async (c) => {
    const commands = c.get('commands');
    const updates = c.req.valid('json');

    const project = await projectService.updateProject(commands, updates);
    return c.json(project);
  },
);

router.post('/modules/update', requireRole(UserRole.Admin), async (c) => {
  const commands = c.get('commands');
  await projectService.updateAllModules(commands);
  return c.json({ message: 'All modules updated' });
});

router.post(
  '/modules/:module/update',
  requireRole(UserRole.Admin),
  zValidator('param', moduleParamSchema),
  async (c) => {
    const commands = c.get('commands');
    const { module } = c.req.valid('param');
    await projectService.updateModule(commands, module);
    return c.json({ message: 'Module updated' });
  },
);

router.get('/modules/importable', requireRole(UserRole.Reader), async (c) => {
  const commands = c.get('commands');
  const modules = await projectService.getImportableModules(commands);
  return c.json(modules);
});

router.post(
  '/modules',
  requireRole(UserRole.Admin),
  zValidator('json', importModuleSchema),
  async (c) => {
    const commands = c.get('commands');
    const { source } = c.req.valid('json');
    await projectService.importModule(commands, source);
    return c.json({ message: 'Module imported successfully' });
  },
);

router.delete(
  '/modules/:module',
  requireRole(UserRole.Admin),
  zValidator('param', moduleParamSchema),
  async (c) => {
    const commands = c.get('commands');
    const { module } = c.req.valid('param');
    await projectService.deleteModule(commands, module);
    return c.json({ message: 'Module removed' });
  },
);

router.get('/hubs', requireRole(UserRole.Reader), async (c) => {
  const commands = c.get('commands');
  const hubs = await projectService.getHubs(commands);
  return c.json(hubs);
});

router.post(
  '/hubs',
  requireRole(UserRole.Admin),
  zValidator('json', addHubSchema),
  async (c) => {
    const commands = c.get('commands');
    const { location } = c.req.valid('json');
    const unreachable = await projectService.addHub(commands, location);
    return c.json({ message: 'Hub added', unreachable });
  },
);

router.delete(
  '/hubs',
  requireRole(UserRole.Admin),
  zValidator('query', removeHubSchema),
  async (c) => {
    const commands = c.get('commands');
    const { location } = c.req.valid('query');
    await projectService.removeHub(commands, location);
    return c.json({ message: 'Hub removed' });
  },
);

router.post('/hubs/fetch', requireRole(UserRole.Admin), async (c) => {
  const commands = c.get('commands');
  const unreachable = await projectService.fetchHubs(commands);
  return c.json({ message: 'Hubs fetched', unreachable });
});

// A non-empty 'failedCards' in the response is a partial success, not an error:
// the command collects per-card failures instead of throwing, so the report of
// what was and was not removed is returned with 200.
router.post(
  '/clean',
  requireRole(UserRole.Admin),
  zValidator('json', cleanSchema),
  async (c) => {
    const commands = c.get('commands');
    const { dryRun } = c.req.valid('json');
    const result = await projectService.cleanProject(commands, dryRun);
    return c.json(result);
  },
);

export default router;
