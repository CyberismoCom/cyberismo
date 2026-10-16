// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Command } from 'commander';
import dotenv from 'dotenv';

import type { Credentials } from '@cyberismo/model';

// Load environment variables from .env file
dotenv.config({ quiet: true });

// Commander; configured in index.ts. Also the target of program.error.
export const program = new Command();

// Sets up credentials for git operations.
export function credentials(): Credentials | undefined {
  return {
    username: process.env.CYBERISMO_GIT_USER,
    token: process.env.CYBERISMO_GIT_TOKEN,
  };
}
