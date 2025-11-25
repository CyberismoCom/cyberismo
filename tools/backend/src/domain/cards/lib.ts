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
import type { Card } from '@cyberismo/data-handler/interfaces/project-interfaces';
import { type CommandManager, evaluateMacros } from '@cyberismo/data-handler';
import { getCardQueryResult } from '../../export.js';
import type { TreeOptions } from '../../types.js';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';

interface result {
  status: number;
  message?: string;
  data?: object;
}

export async function getCardDetails(
  commands: CommandManager,
  key: string,
  staticMode: boolean,
  raw: boolean,
): Promise<result> {
  let cardDetailsResponse: Card;
  try {
    cardDetailsResponse = commands.showCmd.showCardDetails(key);
  } catch {
    return { status: 400, message: `Card ${key} not found from project` };
  }

  if (!cardDetailsResponse) {
    return { status: 400, message: `Card ${key} not found from project` };
  }

  // always parse for now if not in export mode
  if (!staticMode && !raw) {
    await commands.calculateCmd.generate();
  }

  let asciidocContent = '';
  try {
    asciidocContent = await evaluateMacros(cardDetailsResponse.content || '', {
      context: staticMode ? 'exportedSite' : 'localApp',
      mode: staticMode ? 'staticSite' : 'inject',
      project: commands.project,
      cardKey: key,
    });
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

  if (raw) {
    if (!cardDetailsResponse.metadata) {
      throw new Error('Card has no metadata');
    }
    const cardType = await commands.showCmd.showResource(
      cardDetailsResponse.metadata.cardType,
      'cardTypes',
    );

    const fields = [];
    let i = 0;
    for (const customField of cardType.customFields) {
      const fieldType = await commands.showCmd.showResource(
        customField.name,
        'fieldTypes',
      );
      fields.push({
        key: customField.name,
        visibility: 'always',
        index: i++,
        fieldDisplayName: fieldType.displayName,
        fieldDescription: fieldType.description,
        dataType: fieldType.dataType,
        isCalculated: customField.isCalculated,
        value: cardDetailsResponse.metadata[customField.name],
        enumValues: fieldType.enumValues ?? [],
      });
    }
    return {
      status: 200,
      data: {
        key: cardDetailsResponse.key,
        rank: cardDetailsResponse.metadata?.rank,
        title: cardDetailsResponse.metadata?.title || '',
        cardType: cardDetailsResponse.metadata?.cardType || '',
        cardTypeDisplayName: cardDetailsResponse.metadata.cardType,
        workflowState: '',
        lastUpdated: cardDetailsResponse.metadata.lastUpdated,
        fields,
        labels: cardDetailsResponse.metadata?.labels || [],
        links: [],
        notifications: [],
        policyChecks: {
          successes: [],
          failures: [],
        },
        deniedOperations: {
          transition: [],
          move: [],
          delete: [],
          editField: [],
          editContent: [],
        },
        rawContent: cardDetailsResponse.content || '',
        parsedContent: htmlContent,
        attachments: cardDetailsResponse.attachments,
      },
    };
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
/**
 * Returns all cards from a tree query, flattened.
 * @param commands the command manager used for the query
 * @param options optional tree query options
 * @returns a promise that resolves to an array of all cards
 */
export async function allCards(
  commands: CommandManager,
  options?: TreeOptions,
): Promise<QueryResult<'tree'>[]> {
  const fetchedCards = await commands.calculateCmd.runQuery(
    'tree',
    'exportedSite',
    options || {},
  );

  function flattenCards(cards: QueryResult<'tree'>[]): QueryResult<'tree'>[] {
    return cards.reduce<QueryResult<'tree'>[]>((acc, curr) => {
      acc.push(curr);
      if (curr.children && curr.children.length > 0) {
        acc.push(...flattenCards(curr.children));
      }
      return acc;
    }, []);
  }
  return flattenCards(fetchedCards);
}
