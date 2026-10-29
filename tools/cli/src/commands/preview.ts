// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
