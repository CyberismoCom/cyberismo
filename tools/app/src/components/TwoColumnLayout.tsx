// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Box, Drawer } from '@mui/joy';
import { useTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';

interface TwoColumnLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelDefaultSize?: string;
  leftPanelMinSize?: string;
  leftPanelMaxSize?: string;
  collapseBelow?: 'sm' | 'md' | 'lg';
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}

export default function TwoColumnLayout({
  leftPanel,
  rightPanel,
  leftPanelDefaultSize = '20%',
  leftPanelMinSize = '12%',
  leftPanelMaxSize = '40%',
  collapseBelow,
  drawerOpen = false,
  onDrawerClose,
}: TwoColumnLayoutProps) {
  const theme = useTheme();
  const collapsed = useMediaQuery(
    theme.breakpoints.down(collapseBelow ?? 'xs'),
    { defaultMatches: false, noSsr: true },
  );

  const drawer = !!collapseBelow && collapsed;

  // One tree in both modes: the right panel holds the open page, including any
  // unsaved draft, so crossing the breakpoint must not remount it.
  return (
    <Box height="100%">
      {drawer && (
        <Drawer
          open={drawerOpen}
          onClose={onDrawerClose}
          anchor="left"
          sx={{
            '--Drawer-horizontalSize': { xs: '100vw', sm: '420px' },
          }}
        >
          <Box height="100%" sx={{ overflowY: 'auto' }}>
            {leftPanel}
          </Box>
        </Drawer>
      )}
      <Group orientation="horizontal">
        {!drawer && (
          <Panel
            defaultSize={leftPanelDefaultSize}
            minSize={leftPanelMinSize}
            maxSize={leftPanelMaxSize}
          >
            <Box height="100%">{leftPanel}</Box>
          </Panel>
        )}
        {!drawer && <Separator className="resizeHandle" />}
        <Panel>
          <Box flexGrow={1} height="100%" overflow="hidden">
            {rightPanel}
          </Box>
        </Panel>
      </Group>
    </Box>
  );
}
