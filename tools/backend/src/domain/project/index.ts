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
import { z } from 'zod';
import { zValidator } from '../../middleware/zvalidator.js';
import {
  addHubSchema,
  cleanSchema,
  importModuleSchema,
  moduleParamSchema,
  moduleVersionsQuerySchema,
  removeHubSchema,
  updateModuleSchema,
  updatePlanQuerySchema,
  updateProjectSchema,
} from './schema.js';
import * as projectService from './service.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

router.get('/', requireRole(UserRole.Reader), async (c) => {
  const commands = c.get('commands');

  const project = await projectService.getProject(commands);
  return c.json(project);
});

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

router.get('/modules/update-plan', requireRole(UserRole.Admin), async (c) => {
  const commands = c.get('commands');
  const plan = await projectService.getUpdatePlan(commands);
  return c.json(plan);
});

router.get(
  '/modules/versions',
  requireRole(UserRole.Admin),
  zValidator('query', moduleVersionsQuerySchema),
  async (c) => {
    const commands = c.get('commands');
    const { source, module } = c.req.valid('query');
    const versions = await projectService.listModuleVersions(commands, {
      source,
      module,
    });
    return c.json(versions);
  },
);

router.post(
  '/modules/:module/update',
  requireRole(UserRole.Admin),
  zValidator('param', moduleParamSchema),
  async (c) => {
    const commands = c.get('commands');
    const { module } = c.req.valid('param');
    // The body is optional, and the JSON validator middleware rejects a
    // missing one outright, so it is parsed here instead.
    let version: string | undefined;
    if (c.req.header('content-type')?.includes('application/json')) {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Malformed JSON in request body' }, 400);
      }
      const parsed = updateModuleSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: z.prettifyError(parsed.error) }, 400);
      }
      version = parsed.data.version;
    }
    await projectService.updateModule(commands, module, version);
    return c.json({ message: 'Module updated' });
  },
);

router.get(
  '/modules/:module/update-plan',
  requireRole(UserRole.Admin),
  zValidator('param', moduleParamSchema),
  zValidator('query', updatePlanQuerySchema),
  async (c) => {
    const commands = c.get('commands');
    const { module } = c.req.valid('param');
    const { version } = c.req.valid('query');
    const plan = await projectService.getUpdatePlan(commands, module, version);
    return c.json(plan);
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
    const { source, version } = c.req.valid('json');
    await projectService.importModule(commands, source, version);
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
