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

import type { ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { DENSITY } from '../theme';
import { Box, Drawer } from '@mui/joy';
import { useTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';

interface TwoColumnLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelDefaultSize?: string;
  /** Number = pixels, string = percentage. */
  leftPanelMinSize?: number | string;
  leftPanelMaxSize?: string;
  collapseBelow?: 'sm' | 'md' | 'lg';
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}

export default function TwoColumnLayout({
  leftPanel,
  rightPanel,
  leftPanelDefaultSize = '20%',
  // A percentage minimum let the rail shrink to ~156px at 900px wide and
  // ~154px on a 1280 laptop, which truncates most card titles and squeezes
  // the progress figures. Measured against both demo projects, 220px is the
  // width at which no row carrying a percentage truncates.
  leftPanelMinSize = DENSITY.railMinWidth,
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

  if (collapseBelow && collapsed) {
    return (
      <Box height="100%" display="flex">
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
        <Box flexGrow={1} height="100%" overflow="hidden">
          {rightPanel}
        </Box>
      </Box>
    );
  }

  return (
    <Box height="100%">
      <Group orientation="horizontal">
        <Panel
          defaultSize={leftPanelDefaultSize}
          minSize={leftPanelMinSize}
          maxSize={leftPanelMaxSize}
        >
          <Box height="100%">{leftPanel}</Box>
        </Panel>
        <Separator className="resizeHandle" />
        <Panel>
          <Box flexGrow={1} height="100%" overflow="hidden">
            {rightPanel}
          </Box>
        </Panel>
      </Group>
    </Box>
  );
}
