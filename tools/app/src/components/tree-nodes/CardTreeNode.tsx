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

import { Box, Chip, Typography } from '@mui/joy';
import type { NodeRendererProps, NodeApi } from 'react-arborist';
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import ErrorIcon from '@mui/icons-material/Error';
import { getStateColor } from '../../lib/utils';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { BaseTreeNode } from './BaseTreeNode';

interface CardTreeNodeProps extends NodeRendererProps<QueryResult<'tree'>> {
  onNodeClick?: (node: NodeApi<QueryResult<'tree'>>) => void;
}

const chipColor = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 'neutral';
  if (parsed === 0) return 'neutral.300';
  else if (parsed === 100) return 'success.400';
  else return 'warning.300';
};

export const CardTreeNode = (props: CardTreeNodeProps) => {
  const { node } = props;
  const progress = node.data.progress;
  const statusIndicator = node.data.statusIndicator;

  const statusBox =
    statusIndicator === 'error' ? (
      <Box
        display="flex"
        alignItems="center"
        alignSelf="center"
        width={10}
        height={10}
        marginRight={1}
      >
        <ErrorIcon color="error" sx={{ fontSize: 15 }} />
      </Box>
    ) : (
      <Box
        color={getStateColor(statusIndicator)}
        display="flex"
        alignItems="center"
        alignSelf="center"
        width={10}
        height={10}
        marginRight={1}
      >
        <FiberManualRecord sx={{ fontSize: 15 }} />
      </Box>
    );

  return (
    <BaseTreeNode {...props}>
      {statusBox}
      <Typography
        level="title-sm"
        noWrap
        alignSelf="center"
        sx={{ cursor: 'pointer' }}
      >
        {node.data.title ?? node.data.key}
      </Typography>
      <Box margin="auto"></Box>
      {progress !== undefined && (
        <Chip
          size="sm"
          sx={{
            backgroundColor: chipColor(progress),
            color: 'common.black',
            fontWeight: 600,
            fontSize: '0.8rem',
            padding: '0px 6px 0px 6px',
            height: '20px',
            marginLeft: '4px',
            textAlign: 'center',
            alignSelf: 'center',
          }}
        >
          {progress + '%'}
        </Chip>
      )}
    </BaseTreeNode>
  );
};
