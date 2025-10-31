/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useMemo } from 'react';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { flattenTree } from '@/lib/utils';
import { useTree } from '@/lib/api/tree';
import type { AnyNode, GenericNode, NodeKey } from '@/lib/api/types';

export type CardOption = {
  label: string;
  value: string;
};

function isValidNode<T extends NodeKey>(
  node: AnyNode,
  type: T,
): node is GenericNode<T> {
  return node.type === type;
}

export function collectResourceNodes<T extends NodeKey>(
  nodes: AnyNode[] | undefined,
  type: T,
): GenericNode<T>[] {
  if (!nodes) return [];

  const result: GenericNode<T>[] = [];
  const walk = (items: AnyNode[]) => {
    items.forEach((item) => {
      if (isValidNode(item, type)) {
        result.push(item);
      }
      if (item.children) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return result;
}

export function useCardOptions() {
  const { tree, isLoading } = useTree();

  const options = useMemo<CardOption[]>(() => {
    const flattened: QueryResult<'tree'>[] = flattenTree(tree ?? []);
    return flattened.map((card) => ({
      label: `${card.title} (${card.key})`,
      value: card.key,
    }));
  }, [tree]);

  return { options, isLoading };
}
