/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
'use server';

import { CommandManager } from '@cyberismocom/data-handler/command-manager';

export async function createLink(
  fromCard: string,
  toCard: string,
  linkType: string,
  linkDescription?: string,
) {
  const projectPath = process.env.npm_config_project_path || '';
  if (!projectPath) {
    return new Error('project_path environment variable not set.');
  }
  const commands = await CommandManager.getInstance(projectPath);
  await commands.createCmd.createLink(
    fromCard,
    toCard,
    linkType,
    linkDescription,
  );
}

export async function removeLink(
  fromCard: string,
  toCard: string,
  linkType: string,
  linkDescription?: string,
) {
  const projectPath = process.env.npm_config_project_path || '';
  if (!projectPath) {
    return new Error('project_path environment variable not set.');
  }
  const commands = await CommandManager.getInstance(projectPath);
  await commands.removeCmd.remove(
    'link',
    fromCard,
    toCard,
    linkType,
    linkDescription,
  );
}
