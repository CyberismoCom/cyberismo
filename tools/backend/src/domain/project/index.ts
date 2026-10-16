// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import { disableSSG } from 'hono/ssg';
import { zValidator } from '../../middleware/zvalidator.js';
import {
  addHubSchema,
  cleanSchema,
  importModuleSchema,
  moduleParamSchema,
  moduleVersionsQuerySchema,
  removeHubSchema,
  updateModuleSchema,
  updateProjectSchema,
} from './schema.js';
import * as projectService from './service.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

router.get('/', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');

  const project = await projectService.getProject(ws);
  return c.json(project);
});

router.patch(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', updateProjectSchema),
  async (c) => {
    const ws = c.get('ws');
    const updates = c.req.valid('json');

    const project = await projectService.updateProject(
      ws,
      c.get('directory'),
      updates,
    );
    return c.json(project);
  },
);

router.post('/modules/update', requireRole(UserRole.Admin), async (c) => {
  const ws = c.get('ws');
  await projectService.updateAllModules(ws);
  return c.json({ message: 'All modules updated' });
});

router.post(
  '/modules/:module/update',
  requireRole(UserRole.Admin),
  zValidator('param', moduleParamSchema),
  zValidator('json', updateModuleSchema),
  async (c) => {
    const ws = c.get('ws');
    const { module } = c.req.valid('param');
    const { range } = c.req.valid('json');
    await projectService.updateModule(ws, module, range);
    return c.json({ message: 'Module updated' });
  },
);

// These reach the module sources over the network, which an export must not do.
router.get(
  '/modules/versions',
  disableSSG(),
  requireRole(UserRole.Admin),
  zValidator('query', moduleVersionsQuerySchema),
  async (c) => {
    const ws = c.get('ws');
    const target = c.req.valid('query');
    return c.json(await projectService.listModuleVersions(ws, target));
  },
);

router.get(
  '/modules/update-plan',
  disableSSG(),
  requireRole(UserRole.Admin),
  async (c) => {
    const ws = c.get('ws');
    return c.json(await projectService.getUpdatePlan(ws));
  },
);

router.get('/modules/importable', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');
  const modules = await projectService.getImportableModules(ws);
  return c.json(modules);
});

router.post(
  '/modules',
  requireRole(UserRole.Admin),
  zValidator('json', importModuleSchema),
  async (c) => {
    const ws = c.get('ws');
    const { source, range } = c.req.valid('json');
    await projectService.importModule(ws, source, range);
    return c.json({ message: 'Module imported successfully' });
  },
);

router.delete(
  '/modules/:module',
  requireRole(UserRole.Admin),
  zValidator('param', moduleParamSchema),
  async (c) => {
    const ws = c.get('ws');
    const { module } = c.req.valid('param');
    await projectService.deleteModule(ws, module);
    return c.json({ message: 'Module removed' });
  },
);

router.get('/hubs', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');
  const hubs = await projectService.getHubs(ws);
  return c.json(hubs);
});

router.post(
  '/hubs',
  requireRole(UserRole.Admin),
  zValidator('json', addHubSchema),
  async (c) => {
    const ws = c.get('ws');
    const { location } = c.req.valid('json');
    const unreachable = await projectService.addHub(ws, location);
    return c.json({ message: 'Hub added', unreachable });
  },
);

router.delete(
  '/hubs',
  requireRole(UserRole.Admin),
  zValidator('query', removeHubSchema),
  async (c) => {
    const ws = c.get('ws');
    const { location } = c.req.valid('query');
    await projectService.removeHub(ws, location);
    return c.json({ message: 'Hub removed' });
  },
);

router.post('/hubs/fetch', requireRole(UserRole.Admin), async (c) => {
  const ws = c.get('ws');
  const unreachable = await projectService.fetchHubs(ws);
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
    const ws = c.get('ws');
    const { dryRun } = c.req.valid('json');
    const result = await projectService.cleanProject(ws, dryRun);
    return c.json(result);
  },
);

export default router;
