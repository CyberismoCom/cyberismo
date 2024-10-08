/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
'use server';

import { handleMacros } from '@cyberismocom/data-handler/macros';
import Processor from '@asciidoctor/core';

export async function parseContent(key: string, content: string) {
  const projectPath = process.env.npm_config_project_path || '';

  let asciidocContent = '';
  try {
    asciidocContent = await handleMacros(content, {
      mode: 'inject',
      projectPath,
      cardKey: key,
    });
  } catch (error) {
    asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${asciidocContent}`;
  }

  return Processor()
    .convert(asciidocContent, {
      safe: 'safe',
      attributes: {
        imagesdir: `/api/cards/${key}/a`,
        icons: 'font',
      },
    })
    .toString();
}
