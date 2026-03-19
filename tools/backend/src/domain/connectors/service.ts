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

import type { CommandManager } from '@cyberismo/data-handler';
import { z } from 'zod';

export interface ExternalItem {
  key: string;
  title: string;
}

export interface Connector {
  name: string;
  displayName: string;
  items: ExternalItem[];
}

const ConnectorResult = z.object({
  type: z.literal('connector'),
  key: z.string(),
  displayName: z.string(),
});

const ItemResult = z.object({
  type: z.literal('item'),
  connector: z.string(),
  itemKey: z.string(),
  title: z.string(),
});

const QueryResult = z.discriminatedUnion('type', [ConnectorResult, ItemResult]);

// Query to get connectors, their display names, and external items
const CONNECTORS_QUERY = `
% Connectors
result(Name) :- connector(Name).
resultField(Name, "type", "connector", "shortText") :- connector(Name).
resultField(Name, "displayName", Value, "shortText") :- connector(Name), field(Name, "displayName", Value).

% External items
result((Connector, Key)) :- externalItem((Connector, Key)).
resultField((Connector, Key), "type", "item", "shortText") :- externalItem((Connector, Key)).
resultField((Connector, Key), "connector", Connector, "shortText") :- externalItem((Connector, Key)).
resultField((Connector, Key), "itemKey", Key, "shortText") :- externalItem((Connector, Key)).
resultField((Connector, Key), "title", Value, "shortText") :- externalItem((Connector, Key)), field((Connector, Key), "title", Value).
`;

export async function getConnectors(
  commands: CommandManager,
  isSsg: boolean,
): Promise<Connector[]> {
  if (isSsg) {
    return [];
  }

  try {
    const result = await commands.calculateCmd.runLogicProgram(
      CONNECTORS_QUERY,
      'localApp',
    );

    if (result.error) {
      throw new Error(`Error querying connectors: ${result.error}`);
    }

    // Separate connectors from items based on type field
    const connectorsMap = new Map<string, Connector>();
    const items: { connector: string; key: string; title: string }[] = [];

    for (const r of result.results) {
      const parsed = QueryResult.parse(r);
      if (parsed.type === 'connector') {
        connectorsMap.set(parsed.key, {
          name: parsed.key,
          displayName: parsed.displayName,
          items: [],
        });
      } else {
        items.push({
          connector: parsed.connector,
          key: parsed.itemKey,
          title: parsed.title,
        });
      }
    }

    // Associate items with their connectors
    for (const item of items) {
      const connector = connectorsMap.get(item.connector);
      if (connector) {
        connector.items.push({
          key: item.key,
          title: item.title,
        });
      }
    }

    return Array.from(connectorsMap.values());
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(`Error getting connectors: ${error}`);
  }
}
