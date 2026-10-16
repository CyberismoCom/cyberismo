// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback } from 'react';
import type { NodeApi } from 'react-arborist';
import type { QueryResult } from '@cyberismo/model';
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
