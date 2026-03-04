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

export interface ExternalItem {
  key: string;
  title: string;
}

export interface Connector {
  name: string;
  displayName: string;
  items: ExternalItem[];
}

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
): Promise<Connector[]> {
  try {
    const result = await commands.calculateCmd.runLogicProgram(
      CONNECTORS_QUERY,
      'localApp',
    );

    if (result.error) {
      console.error('Error querying connectors:', result.error);
      return [];
    }

    // Separate connectors from items based on type field
    const connectorsMap = new Map<string, Connector>();
    const items: { connector: string; key: string; title: string }[] = [];

    for (const r of result.results) {
      if (r.type === 'connector') {
        connectorsMap.set(r.key, {
          name: r.key,
          displayName:
            typeof r.displayName === 'string' ? r.displayName : r.key,
          items: [],
        });
      } else if (r.type === 'item') {
        const itemKey = typeof r.itemKey === 'string' ? r.itemKey : '';
        items.push({
          connector: typeof r.connector === 'string' ? r.connector : '',
          key: itemKey,
          title: typeof r.title === 'string' ? r.title : itemKey,
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
    console.error('Error getting connectors:', error);
    return [];
  }
}
