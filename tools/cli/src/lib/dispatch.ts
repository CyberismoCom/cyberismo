/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Command } from 'commander';
import dotenv from 'dotenv';

import { Commands } from '@cyberismo/data-handler';
import type { Credentials } from '@cyberismo/data-handler';

// Load environment variables from .env file
dotenv.config({ quiet: true });

// CLI command handler
export const commandHandler = new Commands();

// Commander; configured in index.ts. Also the target of program.error.
export const program = new Command();

// Sets up credentials for git operations.
export function credentials(): Credentials | undefined {
  return {
    username: process.env.CYBERISMO_GIT_USER,
    token: process.env.CYBERISMO_GIT_TOKEN,
  };
}
