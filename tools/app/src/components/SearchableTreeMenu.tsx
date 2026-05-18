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
import {
  Divider,
  Input,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Stack,
  IconButton,
  Typography,
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

import { TreeMenu } from './TreeMenu';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useAvailableProjects } from '../lib/api/projects';
import type { AvailableProject } from '../lib/projectUtils';
import { ProjectSelectionModal } from './modals/ProjectSelectionModal';
import { useAppSelector } from '../lib/hooks';
import { selectRecentPrefixes } from '../lib/slices/project';

type SearchableTreeMenuProps = {
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
  return filterTreeInner(nodes, query.toLowerCase());
};

const filterTreeInner = (
  nodes: QueryResult<'tree'>[],
  lowerQuery: string,
): QueryResult<'tree'>[] => {
  return nodes.reduce<QueryResult<'tree'>[]>((acc, node) => {
    const titleMatches = node.title?.toLowerCase().includes(lowerQuery);
    const filteredChildren = node.children
      ? filterTreeInner(node.children, lowerQuery)
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
  onMove,
  onCardSelect,
  tree,
}: SearchableTreeMenuProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const navigate = useNavigate();
  const { projectPrefix: currentPrefix } = useParams();
  const { data: projects } = useAvailableProjects();
  const recentPrefixes = useAppSelector(selectRecentPrefixes);

  // Recent projects: resolve prefixes to full project objects, exclude current
  const recentProjects = recentPrefixes
    .filter((p) => p !== currentPrefix)
    .map((prefix) => projects?.find((proj) => proj.prefix === prefix))
    .filter((p): p is AvailableProject => p != null);

  const currentProject = projects?.find((p) => p.prefix === currentPrefix);

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClearSearch();
    }
    e.stopPropagation();
  };

  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery],
  );

  return (
    <Stack height="100%" width="100%" bgcolor="background.surface">
      {/* Recent projects - only takes natural height */}
      <Stack flexShrink={0}>
        {/* Recent projects header */}
        <Typography
          level="body-xs"
          textTransform="uppercase"
          fontWeight="lg"
          px={2}
          pt={2}
          pb={0.5}
        >
          {t('projectDialog.recentProjects')}
        </Typography>

        <List size="sm" sx={{ px: 1, py: 0 }}>
          {/* Current project */}
          <ListItem>
            <ListItemButton
              selected
              variant="soft"
              sx={{ borderRadius: 'sm' }}
              onClick={() => navigate(`/projects/${currentPrefix}/cards`)}
            >
              <ListItemDecorator>
                <FolderOpenOutlined sx={{ fontSize: '1.1rem' }} />
              </ListItemDecorator>
              <ListItemContent>
                <Typography level="body-sm" fontWeight="lg" noWrap>
                  {currentProject?.name ?? currentPrefix}
                </Typography>
              </ListItemContent>
            </ListItemButton>
          </ListItem>

          {/* Other recent projects */}
          {recentProjects.map((p) => (
            <ListItem key={p.prefix}>
              <ListItemButton
                sx={{ borderRadius: 'sm' }}
                onClick={() => navigate(`/projects/${p.prefix}/cards`)}
              >
                <ListItemDecorator>
                  <FolderOpenOutlined sx={{ fontSize: '1.1rem' }} />
                </ListItemDecorator>
                <ListItemContent>
                  <Typography level="body-sm" noWrap>
                    {p.name}
                  </Typography>
                </ListItemContent>
              </ListItemButton>
            </ListItem>
          ))}

          {/* More projects */}
          <ListItem>
            <ListItemButton
              data-cy="moreProjectsButton"
              sx={{ borderRadius: 'sm' }}
              onClick={() => setProjectModalOpen(true)}
            >
              <ListItemDecorator>
                <MoreHorizIcon sx={{ fontSize: '1.1rem' }} />
              </ListItemDecorator>
              <ListItemContent>
                <Typography level="body-sm">
                  {t('projectDialog.moreProjects')}
                </Typography>
              </ListItemContent>
            </ListItemButton>
          </ListItem>
        </List>
      </Stack>

      <ProjectSelectionModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />

      <Divider sx={{ my: 1 }} />

      {/* Current project name as tree header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        px={2}
        pb={0.5}
      >
        <Typography level="h4">
          {currentProject?.name ?? currentPrefix}
        </Typography>
        {titleRightSlot}
      </Stack>

      {/* Search input */}
      <Stack px={2} pb={1}>
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
          sx={{ bgcolor: 'transparent' }}
        />
      </Stack>

      <Stack flexGrow={1} minHeight={0}>
        <TreeMenu
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
