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

import type { Card, QueryResult } from '@cyberismo/model';
import type { Workspace } from '@cyberismo/data-handler';
import { preprocessMermaidBlocksForHtml } from '@cyberismo/data-handler/utils/mermaid-renderer';
import { getCardQueryResult } from '../../export.js';
import type { TreeOptions } from '../../types.js';

interface result {
  status: number;
  message?: string;
  data?: object;
}

export async function getCardDetails(
  ws: Workspace,
  key: string,
  staticMode: boolean,
  raw: boolean,
): Promise<result> {
  return ws.consistent(async () => {
    let cardDetailsResponse: Card;
    try {
      cardDetailsResponse = await ws.cards.details(key);
    } catch {
      return { status: 400, message: `Card ${key} not found from project` };
    }

    if (!cardDetailsResponse) {
      return { status: 400, message: `Card ${key} not found from project` };
    }

    let { content: asciidocContent } = await ws.render.macros(
      cardDetailsResponse.content || '',
      {
        context: staticMode ? 'exportedSite' : 'localApp',
        mode: staticMode ? 'staticSite' : 'inject',
        cardKey: key,
        fallback: '',
      },
    );

    // Convert [mermaid] AsciiDoc blocks to passthrough HTML before asciidoctor processes them
    asciidocContent = preprocessMermaidBlocksForHtml(asciidocContent);

    // Rewrite native AsciiDoc xrefs that target other cards into
    // /projects/<prefix>/cards/<key> links.
    asciidocContent = await ws.render.xrefs(
      asciidocContent,
      staticMode ? 'staticSite' : 'inject',
    );

    if (raw) {
      if (!cardDetailsResponse.metadata) {
        throw new Error('Card has no metadata');
      }
      const cardType = await ws.resources.show(
        cardDetailsResponse.metadata.cardType,
        'cardTypes',
      );

      const fields = [];
      let i = 0;
      for (const customField of cardType.customFields) {
        const fieldType = await ws.resources.show(
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
          isOverridable: !!(
            customField.isCalculated && customField.enableOverride
          ),
          overrideValue:
            customField.isCalculated && customField.enableOverride
              ? cardDetailsResponse.metadata[customField.name]
              : undefined,
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
          createdAt: cardDetailsResponse.metadata.createdAt,
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
          adocContent: asciidocContent,
          attachments: cardDetailsResponse.attachments,
          path: cardDetailsResponse.path,
        },
      };
    }

    const card = staticMode
      ? await getCardQueryResult(ws, key)
      : await ws.queries.runQuery('card', 'localApp', {
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
        adocContent: asciidocContent,
        attachments: cardDetailsResponse.attachments,
        path: cardDetailsResponse.path,
      },
    };
  });
}
/**
 * Returns all cards from a tree query, flattened.
 * @param ws the command manager used for the query
 * @param options optional tree query options
 * @returns a promise that resolves to an array of all cards
 */
export async function allCards(
  ws: Workspace,
  options?: TreeOptions,
): Promise<QueryResult<'tree'>[]> {
  const fetchedCards = await ws.queries.runQuery(
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
