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
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Box } from '@mui/joy';

interface TwoColumnLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelDefaultSize?: number;
  leftPanelMinSize?: number;
  leftPanelMaxSize?: number;
}

export default function TwoColumnLayout({
  leftPanel,
  rightPanel,
  leftPanelDefaultSize = 20,
  leftPanelMinSize = 12,
  leftPanelMaxSize = 40,
}: TwoColumnLayoutProps) {
  return (
    <Box height="100%">
      <PanelGroup direction="horizontal">
        <Panel
          defaultSize={leftPanelDefaultSize}
          minSize={leftPanelMinSize}
          maxSize={leftPanelMaxSize}
        >
          <Box height="100%">{leftPanel}</Box>
        </Panel>
        <PanelResizeHandle className="resizeHandle" />
        <Panel>
          <Box padding={2} flexGrow={1} height="100%" overflow="hidden">
            {rightPanel}
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
