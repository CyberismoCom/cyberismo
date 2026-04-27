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

import { useState, useMemo } from 'react';
import type { NodeApi } from 'react-arborist';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { Input, Stack, IconButton, Select, Option } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import FolderOpen from '@mui/icons-material/FolderOpen';
import { TreeMenu } from './TreeMenu';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { globalApiPaths } from '../lib/swr';
import { useNavigate, useParams } from 'react-router';
import type { AvailableProject } from '../lib/projectUtils';

type SearchableTreeMenuProps = {
  title?: string;
  titleRightSlot?: React.ReactNode;

  selectedCardKey: string | null;
  onCardSelect?: (node: NodeApi<QueryResult<'tree'>>) => void;
  onMove?: (card: string, newParent: string, index: number) => void;
  tree: QueryResult<'tree'>[];
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
        children: filteredChildren,
      });
    }

    return acc;
  }, []);
};

export const SearchableTreeMenu = ({
  selectedCardKey,
  titleRightSlot,
  title,
  onMove,
  onCardSelect,
  tree,
}: SearchableTreeMenuProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { projectPrefix: currentPrefix } = useParams();
  // TODO: Replace with a dedicated project management view
  const { data: projects } = useSWR<AvailableProject[]>(
    globalApiPaths.projects(),
  );
  const showProjectSelector = projects && projects.length > 1;

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClearSearch();
    }
    // Stop propagation to prevent global keyboard shortcuts
    e.stopPropagation();
  };

  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery],
  );

  return (
    <Stack height="100%" width="100%" bgcolor="background.surface">
      {/* Project selector — placeholder until the next feature update with proper project manager/selector */}
      {showProjectSelector && (
        <Stack px={3} pt={3} pb={0}>
          <Select
            value={currentPrefix ?? ''}
            onChange={(_e, value) => {
              if (value && value !== currentPrefix) {
                navigate(`/projects/${value}/cards`);
              }
            }}
            size="sm"
            startDecorator={<FolderOpen />}
            sx={{ bgcolor: 'transparent' }}
          >
            {projects.map((p) => (
              <Option key={p.prefix} value={p.prefix}>
                {p.name}
              </Option>
            ))}
          </Select>
        </Stack>
      )}

      {/* Search input */}
      <Stack px={3} pt={showProjectSelector ? 1 : 3} pb={1}>
        <Input
          placeholder={t('searchCards')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          startDecorator={<SearchIcon />}
          endDecorator={
            searchQuery && (
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                onClick={handleClearSearch}
                sx={{ minHeight: 0, minWidth: 0, padding: '2px' }}
              >
                <CloseIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            )
          }
          size="sm"
          sx={{
            bgcolor: 'transparent',
          }}
        />
      </Stack>

      {/* Tree component - flex grow to fill remaining space */}
      <Stack flexGrow={1} minHeight={0}>
        <TreeMenu
          title={title}
          titleRightSlot={titleRightSlot}
          selectedCardKey={selectedCardKey}
          onCardSelect={onCardSelect}
          onMove={onMove}
          tree={filteredTree}
          openByDefault={searchQuery.trim().length > 0}
        />
      </Stack>
    </Stack>
  );
};
