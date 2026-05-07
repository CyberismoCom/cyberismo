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

import { useCallback } from 'react';
import type { NodeApi } from 'react-arborist';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { Stack } from '@mui/joy';
import { BaseTreeComponent } from './BaseTreeComponent';
import { CardTreeNode } from './tree-nodes';

type TreeMenuProps = {
  title?: string;
  titleRightSlot?: React.ReactNode;
  selectedCardKey: string | null;
  onCardSelect?: (node: NodeApi<QueryResult<'tree'>>) => void;
  onMove?: (card: string, newParent: string, index: number) => void;
  tree: QueryResult<'tree'>[];
  openByDefault?: boolean;
};

export const TreeMenu = ({
  selectedCardKey,
  title,
  onMove,
  onCardSelect,
  tree,
  openByDefault = false,
  titleRightSlot,
}: TreeMenuProps) => {
  // react-arborist remounts rows when this ref changes, aborting in-progress drags.
  const handleMove = useCallback(
    (dragIds: string[], parentId: string | null, index: number) => {
      if (onMove && dragIds.length === 1) {
        onMove(dragIds[0], parentId ?? 'root', index);
      }
    },
    [onMove],
  );

  return (
    <Stack height="100%" width="100%" bgcolor="background.surface">
      <BaseTreeComponent
        title={title}
        titleRightSlot={titleRightSlot}
        linkTo={title ? '/cards' : ''}
        data={tree}
        selectedId={selectedCardKey}
        nodeRenderer={CardTreeNode}
        idAccessor={(node) => node.key}
        childrenAccessor={(node) => node.children ?? []}
        onMove={handleMove}
        onNodeClick={onCardSelect}
        openByDefault={openByDefault}
      />
    </Stack>
  );
};
