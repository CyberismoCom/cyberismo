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
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import { getStateColor } from '../../lib/utils';
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

  /*
   * A round dot, as the app has always drawn workflow state: `StateSelector`
   * marks the current state and every transition target the same way, so the
   * tree reads as the same concept rather than a second vocabulary. It is also
   * compact, which a 3px rail was not — hue is easy to judge in a small filled
   * disc and very hard in a thin line.
   *
   * `getStateColor` returns transparent when a card carries no workflow state,
   * so the dot still holds its place and labels stay aligned. Progress does not
   * colour it: a phase row already states completion as a bar and a number, and
   * the number is authoritative.
   */
  const statusMark =
    statusIndicator === 'error' ? (
      <Box
        display="flex"
        alignItems="center"
        alignSelf="center"
        width={10}
        height={10}
        marginRight={1}
        flex="none"
      >
        <ErrorIcon sx={{ fontSize: 15, color: 'var(--cy-state-error)' }} />
      </Box>
    ) : (
      <Box
        aria-hidden
        color={getStateColor(statusIndicator)}
        display="flex"
        alignItems="center"
        alignSelf="center"
        width={10}
        height={10}
        marginRight={1}
        flex="none"
      >
        <FiberManualRecord sx={{ fontSize: 15 }} />
      </Box>
    );

  return (
    <BaseTreeNode {...props}>
      {statusMark}
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
