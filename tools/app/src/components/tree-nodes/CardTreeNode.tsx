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

import { Box, Typography } from '@mui/joy';
import type { NodeRendererProps, NodeApi } from 'react-arborist';
import ErrorIcon from '@mui/icons-material/Error';
import { getStateColor, getProgressColor } from '../../lib/utils';
import { ProgressMeter } from '../ProgressMeter';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { BaseTreeNode } from './BaseTreeNode';

interface CardTreeNodeProps extends NodeRendererProps<QueryResult<'tree'>> {
  onNodeClick?: (node: NodeApi<QueryResult<'tree'>>) => void;
}

export const CardTreeNode = (props: CardTreeNodeProps) => {
  const { node } = props;
  const progress = node.data.progress;
  const statusIndicator = node.data.statusIndicator;
  const title = node.data.title ?? node.data.key;

  // Project and phase cards report progress but carry no workflow state, so
  // the rail falls back to the progress colour rather than going transparent.
  const railColor =
    statusIndicator !== undefined
      ? getStateColor(statusIndicator)
      : progress !== undefined
        ? getProgressColor(Number(progress))
        : 'transparent';

  // State is carried by a rail on the leading edge rather than a dot, so it
  // reads down a long tree at a glance and survives greyscale and print.
  const statusRail = (
    <Box
      aria-hidden
      sx={{
        width: '3px',
        alignSelf: 'stretch',
        flex: 'none',
        marginRight: '8px',
        bgcolor: railColor,
      }}
    />
  );

  const errorMark =
    statusIndicator === 'error' ? (
      <Box
        display="flex"
        alignItems="center"
        alignSelf="center"
        marginRight={0.5}
        flex="none"
      >
        <ErrorIcon sx={{ fontSize: 14, color: 'var(--cy-state-error)' }} />
      </Box>
    ) : null;

  return (
    <BaseTreeNode {...props}>
      {statusRail}
      {errorMark}
      <Typography
        level="title-sm"
        noWrap
        alignSelf="center"
        title={title}
        sx={{
          cursor: 'pointer',
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {title}
      </Typography>
      {progress !== undefined && <ProgressMeter value={Number(progress)} />}
    </BaseTreeNode>
  );
};
