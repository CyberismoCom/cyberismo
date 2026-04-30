/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Context, MiddlewareHandler } from 'hono';
import type { CommandManager } from '@cyberismo/data-handler';
import { getCurrentUser } from './auth.js';
import type { ProjectRegistry } from '../project-registry.js';

// Extend Hono Context type to include our custom properties
declare module 'hono' {
  interface ContextVariableMap {
    commands: CommandManager;
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
  await commands.runAsAuthor({ name: user.name, email: user.email }, () =>
    next(),
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
    return runWithCommands(c, commands, next);
  };
};
