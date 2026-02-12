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
import { CommandManager } from '@cyberismo/data-handler';
import { startServer } from './index.js';
import { exportSite } from './export.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const projectPath = process.env.npm_config_project_path || '';
const commands = await CommandManager.getInstance(projectPath);

if (process.argv.includes('--export')) {
  await exportSite(commands);
} else {
  await startServer(commands);
}
