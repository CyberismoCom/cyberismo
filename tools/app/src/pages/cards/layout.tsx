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
import { CardTreeMenu } from '@/components/CardTreeMenu';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import type { NodeApi } from 'react-arborist';

/**
 * Delay in milliseconds before hiding the loading overlay after a move operation.
 * This prevents UI flickering when the move completes quickly and SWR revalidates.
 */
const MOVE_LOADING_DISMISS_DELAY_MS = 150;

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

  // react-arborist remounts rows when this ref changes, aborting in-progress drags.
  const handleMove = useCallback(
    async (cardKey: string, newParent: string, index: number) => {
      if (!tree) return;
      const parent = findParentCard(tree, cardKey);

      setIsMoving(true);

      try {
        await updateCard(cardKey, {
          parent: newParent === parent?.key ? undefined : newParent,
          index,
        });
      } catch (error) {
        console.error('Failed to move card:', error);
      } finally {
        // Delay hiding the overlay to prevent flickering during SWR revalidation
        setTimeout(() => setIsMoving(false), MOVE_LOADING_DISMISS_DELAY_MS);
      }
    },
    [tree, updateCard],
  );

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
        <SearchableTreeMenu
          titleRightSlot={<CardTreeMenu />}
          tree={tree}
          selectedCardKey={key ?? null}
          onMove={async (cardKey: string, newParent: string, index: number) => {
            const parent = findParentCard(tree, cardKey);
            await updateCard(cardKey, {
              parent: newParent === parent?.key ? undefined : newParent,
              index,
            });
          }}
          onCardSelect={(node) => {
            if (node.data.key) {
              router.safePush(`/cards/${node.data.key}`);
            }
          }}
        />
      }
      rightPanel={<Outlet />}
    />
  );
}
