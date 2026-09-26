/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Context, MiddlewareHandler } from 'hono';
import {
  ChangeSetClosedError,
  ChangeSetNotFoundError,
  type CommandManager,
} from '@cyberismo/data-handler';
import { getCurrentUser } from './auth.js';
import type { ProjectRegistry } from '../project-registry.js';
import type { ProjectEvents } from '../domain/events/project-events.js';

// Extend Hono Context type to include our custom properties
declare module 'hono' {
  interface ContextVariableMap {
    commands: CommandManager;
    events: ProjectEvents;
    projectPath: string;
    registry: ProjectRegistry;
  }
}

/**
 * Set CommandManager on context and run the next handler as the authenticated user.
 */
async function runWithCommands(
  c: Context,
  commands: CommandManager,
  next: () => Promise<void>,
) {
  const user = getCurrentUser(c);
  if (!user) {
    throw new Error('CommandManager expects a user');
  }
  c.set('commands', commands);
  c.set('projectPath', commands.project.basePath);
  await commands.runAsAuthor(
    { name: user.name, email: user.email, id: user.id },
    () => next(),
    { kind: 'human' },
  );
}

// TODO: Remove once MCP is made project-scoped via attachProjectRegistry
export const attachCommandManager = (
  commands: CommandManager,
): MiddlewareHandler => {
  return (c, next) => runWithCommands(c, commands, next);
};

/**
 * Middleware that resolves the project from the registry and sets the
 * CommandManager on context.
 *
 * @param registry - Project registry to look up projects.
 * @param fixedPrefix - When provided, used instead of the `:prefix` route
 *   param. This is needed in export/SSG mode where routes are mounted at
 *   concrete paths (e.g. `/api/projects/decision/...`) with no dynamic param.
 */
export const attachProjectRegistry = (
  registry: ProjectRegistry,
  fixedPrefix?: string,
): MiddlewareHandler => {
  return async (c: Context, next) => {
    c.set('registry', registry);
    const prefix = c.req.param('prefix') ?? fixedPrefix;
    if (!prefix) {
      return c.json({ error: 'Project prefix is required' }, 400);
    }
    const commands = registry.get(prefix);
    if (!commands) {
      return c.json({ error: `Project '${prefix}' not found` }, 404);
    }
    c.set('events', registry.eventsFor(commands));
    const refusal = await refuseWhileInChangeSet(c, registry, commands);
    if (refusal) {
      return refusal;
    }
    return runWithCommands(c, commands, next);
  };
};

// Paths below a project that are not the project's content: managing
// changeSets, and the changeSets' own routes; presence.
const NOT_PROJECT_CONTENT =
  /^\/api\/projects\/[^/]+\/(changesets|events)(\/|$)/;

/**
 * Refuses a write to the project itself from a user who works in a
 * changeSet: the change belongs in the changeSet. A client that still
 * writes to the project (a stale tab, a missed event) learns so instead of
 * changing the project behind the user's back.
 */
async function refuseWhileInChangeSet(
  c: Context,
  registry: ProjectRegistry,
  commands: CommandManager,
) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return undefined;
  if (NOT_PROJECT_CONTENT.test(c.req.path)) return undefined;
  const user = getCurrentUser(c);
  if (!user) return undefined;
  const active = await registry.changeSetsFor(commands).getActive(user.id);
  if (!active) return undefined;
  return c.json(
    {
      error: `You are working in changeset "${active.title}": changes go there, not to the project`,
      code: 'changeset-active',
    },
    409,
  );
}

/**
 * Middleware that serves a request from one of a project's changeSets: the
 * CommandManager and event stream on context are the changeSet's own, so any
 * project-scoped route works inside the changeSet.
 * @param registry - Project registry to look up projects and changeSets.
 */
export const attachChangeSet = (
  registry: ProjectRegistry,
): MiddlewareHandler => {
  return async (c: Context, next) => {
    c.set('registry', registry);
    const prefix = c.req.param('prefix');
    const id = c.req.param('changeSetId');
    const main = prefix ? registry.get(prefix) : undefined;
    if (!main || !id) {
      return c.json({ error: `Project '${prefix}' not found` }, 404);
    }
    let commands: CommandManager;
    try {
      commands = await registry.openChangeSet(main, id);
    } catch (error) {
      if (error instanceof ChangeSetNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof ChangeSetClosedError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
    c.set('events', registry.eventsFor(commands));
    return runWithCommands(c, commands, next);
  };
};
