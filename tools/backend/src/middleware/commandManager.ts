/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Context, MiddlewareHandler } from 'hono';
import { CommandManager } from '@cyberismo/data-handler';

// Extend Hono Context type to include our custom properties
declare module 'hono' {
  interface ContextVariableMap {
    commands: CommandManager;
    projectPath: string;
  }
}

export const attachCommandManager = (
  projectPath?: string,
): MiddlewareHandler => {
  return async (c: Context, next) => {
    if (!projectPath) {
      return c.text('project_path environment variable not set.', 500);
    }

    try {
      c.set('commands', await CommandManager.getInstance(projectPath));
      c.set('projectPath', projectPath);
      await next();
    } catch (error) {
      return c.text(
        `Failed to initialize CommandManager: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
      );
    }
  };
};
