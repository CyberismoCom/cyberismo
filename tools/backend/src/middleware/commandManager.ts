/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Request, Response, NextFunction } from 'express';
import { CommandManager } from '@cyberismocom/data-handler';

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      commands: CommandManager;
      projectPath: string;
    }
  }
}

export const attachCommandManager =
  (projectPath?: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!projectPath) {
      return res.status(500).send('project_path environment variable not set.');
    }

    try {
      req.commands = await CommandManager.getInstance(projectPath);
      req.projectPath = projectPath;
      next();
    } catch (error) {
      return res
        .status(500)
        .send(
          `Failed to initialize CommandManager: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
    }
  };
