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

import { type Command } from 'commander';

import { previewSite } from '@cyberismo/backend';

export function registerPreview(program: Command) {
  program
    .command('preview')
    .description('Preview the exported site')
    .argument(
      '[dir]',
      'Directory to preview. If not provided, current directory is used.',
    )
    .action(async (dir: string) => {
      await previewSite(dir || '.', true);
    });
}
