// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context, MiddlewareHandler } from 'hono';
import type { ActorRef } from '@cyberismo/model';
import type { ProjectDirectory, Workspace } from '@cyberismo/data-handler';
import { getCurrentUser } from './auth.js';
import { UserRole, type UserInfo } from '../types.js';
import type { ProjectEvents } from '../domain/events/project-events.js';
import type { EventsByProject } from '../domain/events/events-by-project.js';

// Extend Hono Context type to include our custom properties
declare module 'hono' {
  interface ContextVariableMap {
    ws: Workspace;
    events: ProjectEvents;
    projectPath: string;
    directory: ProjectDirectory;
    eventsByProject: EventsByProject;
  }
}

/** The actor a user acts as. */
export function actorOf(user: UserInfo): ActorRef {
  return {
    kind: user.role === UserRole.Connector ? 'connector' : 'user',
    id: user.id,
    name: user.name,
  };
}

/**
 * Middleware that opens the authenticated user's handle over the project
 * and puts it, with the project's events and the directory, on the context.
 * An unknown project is refused with ProjectNotFoundError (404).
 *
 * @param directory - Directory the project is opened from.
 * @param events - Events of the directory's projects.
 * @param fixedPrefix - When provided, used instead of the `:prefix` route
 *   param. This is needed in export/SSG mode where routes are mounted at
 *   concrete paths (e.g. `/api/projects/decision/...`) with no dynamic param.
 */
export const attachProjectDirectory = (
  directory: ProjectDirectory,
  events: EventsByProject,
  fixedPrefix?: string,
): MiddlewareHandler => {
  return async (c: Context, next) => {
    const prefix = c.req.param('prefix') ?? fixedPrefix;
    if (!prefix) {
      return c.json({ error: 'Project prefix is required' }, 400);
    }
    const user = getCurrentUser(c);
    if (!user) {
      throw new Error('A project handle expects a user');
    }
    const identity = { name: user.name, email: user.email };
    const ws = await directory.open(prefix, actorOf(user), identity);
    c.set('directory', directory);
    c.set('eventsByProject', events);
    c.set('events', await events.for(prefix));
    c.set('ws', ws);
    c.set('projectPath', ws.path);
    await next();
  };
};
