/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { ReactNode, useState } from 'react';
import { TreeMenu } from '../components/TreeMenu';
import AppToolbar from '../components/AppToolbar';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Outlet } from 'react-router';

import {
  Stack,
  Box,
  CircularProgress,
  Typography,
  styled,
  Container,
  IconButton,
  Snackbar,
  CssBaseline,
} from '@mui/joy';
import { useProject } from '../lib/api';
import { SWRConfig } from 'swr';
import { getSwrConfig } from '../lib/swr';
import theme from '../theme';
import '../lib/i18n';
import {
  createTheme,
  ThemeProvider,
  THEME_ID as MATERIAL_THEME_ID,
} from '@mui/material/styles';
import { CssVarsProvider as JoyCssVarsProvider } from '@mui/joy/styles';
import { NewCardModal } from '../components/modals';
import StoreProvider from '../providers/StoreProvider';
import {
  useAppDispatch,
  useAppSelector,
  useAppRouter,
  useKeyboardShortcut,
  useOptionalKeyParam,
} from '../lib/hooks';
import CloseRounded from '@mui/icons-material/CloseRounded';
import {
  closeNotification,
  removeNotification,
} from '../lib/slices/notifications';
import { findParentCard } from '../lib/utils';
import { useTree } from '../lib/api/tree';
function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
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

  const notifications = useAppSelector(
    (state) => state.notifications.notifications,
  );

  const dispatch = useAppDispatch();

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
    <Box height="100%">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={20} minSize={12} maxSize={40}>
          <Box height="100%">
            <TreeMenu
              title={project.name}
              tree={tree}
              selectedCardKey={key ?? null}
              onMove={async (
                cardKey: string,
                newParent: string,
                index: number,
              ) => {
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
          </Box>
        </Panel>
        <PanelResizeHandle className="resizeHandle" />
        <Panel>
          <Box padding={2} flexGrow={1} height="100%" overflow="hidden">
            {children}
          </Box>
        </Panel>
      </PanelGroup>

      {notifications.map((notification, index) => (
        <Snackbar
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          key={notification.id}
          open={!notification.closed}
          sx={{
            marginBottom: index * 9,
          }}
          autoHideDuration={notification.type === 'error' ? 10000 : 4000}
          color={notification.type === 'error' ? 'danger' : 'success'}
          variant="solid"
          onClose={(_, reason) => {
            // If the notification has been closed by clicking away, and it has been less than 2 seconds, don't close it
            if (
              reason === 'clickaway' &&
              notification.createdAt + 2000 >= Date.now()
            ) {
              return;
            }

            dispatch(closeNotification(notification.id));
          }}
          onUnmount={() => {
            dispatch(removeNotification(notification.id));
          }}
          endDecorator={
            <IconButton
              variant="plain"
              size="sm"
              color="neutral"
              onClick={() => {
                dispatch(closeNotification(notification.id));
              }}
            >
              <CloseRounded />
            </IconButton>
          }
        >
          {notification.message}
        </Snackbar>
      ))}
    </Box>
  );
}

const Main = styled('main')(() => ({
  height: 'calc(100vh - 44px)', // 44px is the height of the toolbar
  flexGrow: 1,
}));

function MainLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const key = useOptionalKeyParam();

  useKeyboardShortcut(
    {
      key: 'c',
    },
    () => {
      setIsCreateDialogOpen(true);
    },
  );

  return (
    <Stack>
      <AppToolbar onNewCard={() => setIsCreateDialogOpen(true)} />
      <Main>
        <AppLayout>{children}</AppLayout>
      </Main>
      <NewCardModal
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        cardKey={key}
      />
    </Stack>
  );
}

const materialTheme = createTheme();

export default function CardsLayout() {
  return (
    <ThemeProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }}>
      <JoyCssVarsProvider theme={theme}>
        <CssBaseline />
        <StoreProvider>
          <SWRConfig value={getSwrConfig()}>
            <Stack>
              <Main>
                <MainLayout>
                  <Outlet />
                </MainLayout>
              </Main>
            </Stack>
          </SWRConfig>
        </StoreProvider>
      </JoyCssVarsProvider>
    </ThemeProvider>
  );
}
