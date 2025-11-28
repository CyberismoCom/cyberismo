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
import { TreeMenu } from '../../components/TreeMenu';
import TwoColumnLayout from '../../components/TwoColumnLayout';
import { Outlet, useLocation } from 'react-router';

import {
  Box,
  CircularProgress,
  Typography,
  IconButton,
  Drawer,
  Stack,
  Sheet,
  useTheme,
} from '@mui/joy';
import MenuIcon from '@mui/icons-material/Menu';
import TocIcon from '@mui/icons-material/Toc';
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
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLinkTypes } from '@/lib/api';
import LoadingGate from '@/components/LoadingGate';
import { useMediaQuery } from '@mui/material';
import { ContentSidebar } from '@/components/ContentSidebar';

// A lightweight wrapper that will host the card view inside the layout so we can reuse TOC drawer
// without changing the existing routing structure too much.

export default function AppLayout() {
  // Last URL parameter after /cards base is the card key
  const key = useOptionalKeyParam();
  const location = useLocation();
  const { project, error, isLoading, updateCard } = useProject();
  const { tree, isLoading: isLoadingTree, error: treeError } = useTree();
  const { card } = useCard(key);
  const router = useAppRouter();
  useLinkTypes(); // ensure link types cached if needed for future expansion

  // Detect edit mode from URL
  const isEditMode = location.pathname.endsWith('/edit');

  // Theme + media
  const theme = useTheme();
  const isMobile = useMediaQuery(
    `(max-width:${theme.breakpoints.values.md - 0.05}px)`,
  );

  // Drawer state & refs
  const [navOpen, setNavOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [mobileVisibleHeaders, setMobileVisibleHeaders] = useState<
    string[] | null
  >(null);
  const navButtonRef = useRef<HTMLButtonElement | null>(null);
  const tocButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close drawers when changing card key
  useEffect(() => {
    setNavOpen(false);
    setTocOpen(false);
  }, [key]);

  // Listen for visible header updates broadcast from ContentArea to drive TOC highlighting in mobile drawer
  useEffect(() => {
    const listener = (e: Event) => {
      const custom = e as CustomEvent<{ cardKey: string; headers: string[] }>;
      if (!custom.detail) return;
      if (key && custom.detail.cardKey !== key) return; // ensure event corresponds to current card
      setMobileVisibleHeaders(custom.detail.headers || null);
    };
    window.addEventListener(
      'cyberismo:visibleHeaders',
      listener as EventListener,
    );
    return () =>
      window.removeEventListener(
        'cyberismo:visibleHeaders',
        listener as EventListener,
      );
  }, [key]);

  // Card selection handler reused across desktop/mobile
  const handleCardSelect = useCallback(
    (node: any) => {
      if (node?.data?.key) {
        if (isMobile) setNavOpen(false);
        router.safePush(`/cards/${node.data.key}`);
      }
    },
    [router, isMobile],
  );

  // Document title
  const title =
    card?.title && project?.name
      ? `${card.title} - ${project.name}`
      : project?.name || 'Cyberismo App';
  useDocumentTitle(title);

  // Keyboard shortcut: go to first card
  useKeyboardShortcut({ key: 'home' }, () => {
    const firstKey = tree?.[0]?.key;
    if (firstKey) router.safePush(`/cards/${firstKey}`);
  });

  // Loading / error guards
  if (isLoading || isLoadingTree)
    return (
      <Box padding={2}>
        <CircularProgress size="md" color="primary" />
      </Box>
    );
  if (error || !project || !tree) {
    return (
      <Box padding={2}>
        <Typography level="body-md" color="danger">
          Could not open project
        </Typography>
        <Typography level="body-md" color="danger">
          {treeError ? treeError.message : error?.message}
        </Typography>
      </Box>
    );
  }

  // Mobile layout: top bar + drawers
  if (isMobile) {
    return (
      <Box
        sx={{
          height: '100%',
          // Support iOS safe areas
          '@supports (padding-top: env(safe-area-inset-top))': {
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          },
        }}
        display="flex"
        flexDirection="column"
      >
        <Sheet
          variant="soft"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: 1,
            pr: 2,
            py: 0.5,
            borderBottom: '1px solid var(--joy-palette-neutral-outlinedBorder)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <IconButton
            aria-label="Open navigation"
            ref={navButtonRef}
            onClick={() => setNavOpen(true)}
            size="sm"
            variant="outlined"
            color="neutral"
          >
            <MenuIcon />
          </IconButton>
          <Typography level="title-sm" flexGrow={1} noWrap>
            {project.name}
          </Typography>
          <IconButton
            aria-label="Open table of contents"
            ref={tocButtonRef}
            onClick={() => setTocOpen(true)}
            size="sm"
            variant="outlined"
            color="neutral"
            disabled={!card}
          >
            <TocIcon />
          </IconButton>
        </Sheet>
        <Box flexGrow={1} minHeight={0} display="flex">
          <Box flexGrow={1} minWidth={0} position="relative" overflow="hidden">
            <Outlet />
          </Box>
        </Box>

        {/* Navigation Drawer for mobile */}
        <Drawer
          open={navOpen}
          onClose={() => {
            setNavOpen(false);
            navButtonRef.current?.focus();
          }}
          anchor="left"
          size="md"
          slotProps={{ content: { sx: { p: 0, width: 300 } } }}
        >
          <Stack height="100%" overflow="auto">
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
              onCardSelect={handleCardSelect}
            />
          </Stack>
        </Drawer>

        {/* TOC Drawer for mobile */}
        <Drawer
          open={tocOpen}
          onClose={() => {
            setTocOpen(false);
            tocButtonRef.current?.focus();
          }}
          anchor="right"
          size="md"
          slotProps={{
            content: {
              sx: {
                p: 0,
                width: 340,
                display: 'flex',
                flexDirection: 'column',
              },
            },
          }}
        >
          <LoadingGate values={[card]}>
            {card && (
              <ContentSidebar
                card={card}
                htmlContent={card.parsedContent || ''}
                visibleHeaderIds={mobileVisibleHeaders}
                showAttachments={isEditMode}
                onNavigate={() => {
                  setTocOpen(false);
                  // delay to allow hash scroll then restore focus
                  setTimeout(() => tocButtonRef.current?.focus(), 50);
                }}
              />
            )}
          </LoadingGate>
        </Drawer>
      </Box>
    );
  }

  // Desktop layout: resizable panels (restored) using existing TwoColumnLayout component
  return (
    <TwoColumnLayout
      leftPanel={
        <SearchableTreeMenu
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
          onCardSelect={handleCardSelect}
        />
      }
      rightPanel={<Outlet />}
      leftPanelDefaultSize={22}
      leftPanelMinSize={12}
      leftPanelMaxSize={40}
    />
  );
}
