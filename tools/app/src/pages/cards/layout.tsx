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
import { TreeMenu } from '../../components/TreeMenu';
import TwoColumnLayout from '../../components/TwoColumnLayout';
import { Outlet } from 'react-router';

import { Box, CircularProgress, Typography, Container } from '@mui/joy';
import { useProject } from '../../lib/api';
import {
  useAppRouter,
  useKeyboardShortcut,
  useOptionalKeyParam,
} from '../../lib/hooks';
import { findParentCard } from '../../lib/utils';
import { useTree } from '../../lib/api/tree';

export default function AppLayout() {
  // Last URL parameter after /cards base is the card key
  const key = useOptionalKeyParam();
  const { project, error, isLoading, updateCard } = useProject();
  const { tree, isLoading: isLoadingTree, error: treeError } = useTree();

  const router = useAppRouter();

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
        <TreeMenu
          title={project.name}
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
