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

import { resolve } from 'node:path';

import { Command, Option } from 'commander';

import { errorFunction } from '@cyberismo/data-handler';

import {
  InstallSkills,
  type InstallSkillsOptions,
} from '../install-skills/install-skills.js';
import { handleResponse } from '../lib/output.js';

export function registerInstallSkills(program: Command) {
  // Install the dynamic skill discovery bootstrap skill + MCP config for an AI agent.
  const installSkillsCmd = new Command('install-skills')
    .description(
      'Install the dynamic skill discovery bootstrap skill and MCP server configuration for an AI agent platform. Installs into the current directory by default — run it from (or pass) the directory your AI agent operates in, usually the repository root.',
    )
    .argument(
      '[path]',
      'Directory to install into. Defaults to the current directory; set it to where your AI agent runs (e.g. the repository root) if that differs from where you run this command.',
    )
    .addOption(
      new Option('-t, --target <platform>', 'Target AI agent platform')
        .choices(['claude'])
        .default('claude'),
    )
    .option(
      '--url <url>',
      'MCP server URL to register',
      'http://localhost:3000/mcp',
    );
  program.addCommand(installSkillsCmd);
  installSkillsCmd.action(
    async (path: string | undefined, options: InstallSkillsOptions) => {
      const targetPath = resolve(path ?? process.cwd());
      try {
        const written = await InstallSkills.install(targetPath, options);
        handleResponse({
          statusCode: 200,
          message: `Installed skill discovery into '${targetPath}':\n${written
            .map((path) => `  ${path}`)
            .join('\n')}`,
        });
      } catch (error) {
        handleResponse({ statusCode: 400, message: errorFunction(error) });
      }
    },
  );
}
