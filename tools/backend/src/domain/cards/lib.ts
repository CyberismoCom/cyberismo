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

import Processor from '@asciidoctor/core';
import {
  Card,
  CardLocation,
  ProjectFetchCardDetails,
} from '@cyberismo/data-handler/interfaces/project-interfaces';
import { CommandManager, evaluateMacros } from '@cyberismo/data-handler';
import { getCardQueryResult, isSSGContext } from '../../export.js';

export async function getCardDetails(
  commands: CommandManager,
  key: string,
  staticMode?: boolean,
): Promise<any> {
  const fetchCardDetails: ProjectFetchCardDetails = {
    attachments: true,
    children: false,
    content: true,
    contentType: 'adoc',
    metadata: false,
    parent: false,
    location: CardLocation.projectOnly,
  };

  let cardDetailsResponse: Card | undefined;
  try {
    cardDetailsResponse = await commands.showCmd.showCardDetails(
      fetchCardDetails,
      key,
    );
  } catch {
    return { status: 400, message: `Card ${key} not found from project` };
  }

  if (!cardDetailsResponse) {
    return { status: 400, message: `Card ${key} not found from project` };
  }

  let asciidocContent = '';
  try {
    asciidocContent = await evaluateMacros(
      cardDetailsResponse.content || '',
      {
        context: staticMode ? 'exportedSite' : 'localApp',
        mode: staticMode ? 'static' : 'inject',
        project: commands.project,
        cardKey: key,
      },
      commands.calculateCmd,
    );
  } catch (error) {
    asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${asciidocContent}`;
  }

  const htmlContent = Processor()
    .convert(asciidocContent, {
      safe: 'safe',
      attributes: {
        imagesdir: `/api/cards/${key}/a`,
        icons: 'font',
      },
    })
    .toString();

  // always parse for now if not in export mode
  if (!staticMode) {
    await commands.calculateCmd.generate();
  }

  const card = staticMode
    ? await getCardQueryResult(commands.project.basePath, key)
    : await commands.calculateCmd.runQuery('card', 'localApp', {
        cardKey: key,
      });
  if (card.length !== 1) {
    throw new Error('Query failed. Check card-query syntax');
  }

  return {
    status: 200,
    data: {
      ...card[0],
      rawContent: cardDetailsResponse.content || '',
      parsedContent: htmlContent,
      attachments: cardDetailsResponse.attachments,
    },
  };
}
