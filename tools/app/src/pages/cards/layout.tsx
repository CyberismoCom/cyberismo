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
import { SearchableTreeMenu } from '../../components/SearchableTreeMenu';
import TwoColumnLayout from '../../components/TwoColumnLayout';
import { Outlet } from 'react-router';
import { useCallback, useState } from 'react';

import { Box, CircularProgress, Typography, Container } from '@mui/joy';
import { useProject } from '../../lib/api';
import {
  useAppRouter,
  useKeyboardShortcut,
  useOptionalKeyParam,
  useDocumentTitle,
} from '../../lib/hooks';
import { findParentCard } from '../../lib/utils';
import { useTree } from '../../lib/api/tree';
import { useCard } from '../../lib/api/card';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import type { NodeApi } from 'react-arborist';

export default function AppLayout() {
  // Last URL parameter after /cards base is the card key
  const key = useOptionalKeyParam();
  const { project, error, isLoading, updateCard } = useProject();
  const { tree, isLoading: isLoadingTree, error: treeError } = useTree();
  const { card } = useCard(key);
  const [isMoving, setIsMoving] = useState(false);

  const router = useAppRouter();

  // Set document title based on current card and project
  const title =
    card?.title && project?.name
      ? `${card.title} - ${project.name}`
      : project?.name || 'Cyberismo App';
  useDocumentTitle(title);

  useKeyboardShortcut(
    {
      key: 'home',
    },
    () => {
      const key = tree?.[0]?.key;
      if (key) {
        router.safePush(`/cards/${key}`);
      }
    },
  );

  // Memoize the onMove handler to prevent recreation on every render
  // MUST be called before any conditional returns to satisfy Rules of Hooks
  const handleMove = useCallback(
    async (cardKey: string, newParent: string, index: number) => {
      if (!tree) return;
      const parent = findParentCard(tree, cardKey);

      // Show loading state
      setIsMoving(true);

      try {
        // Fire the update - use a small delay to ensure UI updates
        await updateCard(cardKey, {
          parent: newParent === parent?.key ? undefined : newParent,
          index,
        });
      } catch (error) {
        console.error('Failed to move card:', error);
        // SWR will revalidate and restore the correct state
      } finally {
        // Small delay to prevent flickering
        setTimeout(() => setIsMoving(false), 150);
      }
    },
    [tree, updateCard],
  );

  // Memoize the onCardSelect handler to prevent recreation
  const handleCardSelect = useCallback(
    (node: NodeApi<QueryResult<'tree'>>) => {
      if (node.data.key) {
        router.safePush(`/cards/${node.data.key}`);
      }
    },
    [router],
  );

  if (isLoading || isLoadingTree)
    return (
      <Box padding={2}>
        <CircularProgress size="md" color="primary" />
      </Box>
    );

  if (error || !project || !tree) {
    return (
      <Container>
        <Typography level="body-md" color="danger">
          Could not open project
        </Typography>
        <Typography level="body-md" color="danger">
          {treeError ? treeError.message : error.message}
        </Typography>
      </Container>
    );
  }
  return (
    <TwoColumnLayout
      leftPanel={
        <Box position="relative" height="100%">
          <SearchableTreeMenu
            title={project.name}
            tree={tree}
            selectedCardKey={key ?? null}
            onMove={handleMove}
            onCardSelect={handleCardSelect}
          />
          {isMoving && (
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              bgcolor="rgba(255, 255, 255, 0.7)"
              sx={{
                backdropFilter: 'blur(2px)',
                zIndex: 1000,
                pointerEvents: 'none',
              }}
            >
              <CircularProgress size="md" color="primary" />
            </Box>
          )}
        </Box>
      }
      rightPanel={<Outlet />}
    />
  );
}
