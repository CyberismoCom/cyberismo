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

import { useState, useMemo } from 'react';
import { NodeApi } from 'react-arborist';
import { QueryResult } from '@cyberismo/data-handler/types/queries';
import { Input, Stack } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import { BaseTreeComponent } from './BaseTreeComponent';
import { CardTreeNode } from './tree-nodes';

type TreeMenuProps = {
  title?: string;
  selectedCardKey: string | null;
  onCardSelect?: (node: NodeApi<QueryResult<'tree'>>) => void;
  onMove?: (card: string, newParent: string, index: number) => void;
  tree: QueryResult<'tree'>[];
};

export const TreeMenu = ({
  selectedCardKey,
  title,
  onMove,
  onCardSelect,
  tree,
}: TreeMenuProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Prevent global keyboard shortcuts from firing when typing in search
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Stop propagation AND prevent default to block global shortcuts
    // This is critical for single-key shortcuts like 'c', 'e', 'home'
    e.stopPropagation();
  };

  // Recursively filter tree nodes based on search query
  const filterTree = (
    nodes: QueryResult<'tree'>[],
    query: string,
  ): QueryResult<'tree'>[] => {
    if (!query.trim()) return nodes;

    const lowerQuery = query.toLowerCase();

    return nodes.reduce<QueryResult<'tree'>[]>((acc, node) => {
      const titleMatches = node.title?.toLowerCase().includes(lowerQuery);
      const filteredChildren = node.children
        ? filterTree(node.children, query)
        : [];

      // Include node if title matches or any descendant matches
      if (titleMatches || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        });
      }

      return acc;
    }, []);
  };

  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery],
  );

  const handleMove = (
    dragIds: string[],
    parentId: string | null,
    index: number,
  ) => {
    if (onMove && dragIds.length === 1) {
      onMove(dragIds[0], parentId ?? 'root', index);
    }
  };

  return (
    <Stack height="100%" width="100%" bgcolor="#f0f0f0">
      {/* Search input */}
      <Stack px={2} pt={2} pb={1}>
        <Input
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          startDecorator={<SearchIcon />}
          size="sm"
          sx={{
            bgcolor: 'transparent',
            '--Input-focusedThickness': '2px',
          }}
        />
      </Stack>

      {/* Tree component */}
      <BaseTreeComponent
        title={title}
        linkTo={title ? '/cards' : ''}
        data={filteredTree}
        selectedId={selectedCardKey}
        nodeRenderer={CardTreeNode}
        idAccessor={(node) => node.key}
        childrenAccessor="children"
        onMove={handleMove}
        onNodeClick={onCardSelect}
        openByDefault={searchQuery.trim().length > 0}
      />
    </Stack>
  );
};
