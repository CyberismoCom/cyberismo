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

export async function getConnectors(
  commands: CommandManager,
): Promise<Connector[]> {
  await commands.calculateCmd.generate();
  const results = await commands.calculateCmd.runQuery(
    'connectors',
    'localApp',
  );

  // Separate connectors from items based on type field
  const connectorsMap = new Map<string, Connector>();
  const items: { connector: string; key: string; title: string }[] = [];

  for (const r of results) {
    if (r.type === 'connector') {
      connectorsMap.set(r.key, {
        name: r.key,
        displayName: r.displayName ?? r.key,
        items: [],
      });
    } else {
      items.push({
        connector: r.connector ?? '',
        key: r.itemKey ?? '',
        title: r.title ?? '',
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
}
