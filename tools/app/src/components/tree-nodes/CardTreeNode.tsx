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
import { useMemo } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import ErrorIcon from '@mui/icons-material/Error';
import { getStateColor } from '../../lib/utils';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';

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

export const CardTreeNode = ({
  node,
  style,
  dragHandle,
  onNodeClick,
}: CardTreeNodeProps) => {
  const progress = node.data.progress;

  // Safely check for drag states with useMemo to prevent hook ordering issues
  const visualState = useMemo(() => {
    const isDropTarget = node.state?.willReceiveDrop || false;
    const isDragging = node.state?.isDragging || false;

    return {
      backgroundColor: isDropTarget
        ? 'primary.softBg'
        : isDragging
        ? 'neutral.softBg'
        : node.isSelected
        ? 'background.body'
        : 'transparent',
      borderStyle: isDropTarget
        ? { border: '2px solid', borderColor: 'primary.500' }
        : {},
      opacity: isDragging ? 0.5 : 1,
      cursor: isDragging ? 'grabbing' : 'grab',
    };
  }, [node.state, node.isSelected]);

  const renderStatusIndicator = () => {
    const statusIndicator = node.data.statusIndicator;

    if (statusIndicator === 'error') {
      return (
        <Box
          display="flex"
          alignItems="center"
          alignSelf="center"
          width={10}
          height={10}
          marginRight={1}
        >
          <ErrorIcon
            color="error"
            sx={{
              fontSize: 15,
            }}
          />
        </Box>
      );
    }

    return (
      <Box
        color={getStateColor(statusIndicator)}
        display="flex"
        alignItems="center"
        alignSelf="center"
        width={10}
        height={10}
        marginRight={1}
      >
        <FiberManualRecord
          sx={{
            fontSize: 15,
          }}
        />
      </Box>
    );
  };

  return (
    <Box
      className="treenode"
      style={style}
      ref={dragHandle}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.isClosed) node.toggle();
        onNodeClick?.(node);
      }}
      alignContent="center"
      display="flex"
      paddingRight="4px"
      height="100%"
      marginRight={1}
      borderRadius="6px 6px 6px 6px"
      bgcolor={visualState.backgroundColor}
      sx={{
        opacity: visualState.opacity,
        transition: 'all 0.15s ease-in-out',
        ...visualState.borderStyle,
        cursor: visualState.cursor,
      }}
    >
      <ExpandMoreIcon
        data-cy="ExpandMoreIcon"
        visibility={
          node.children && node.children.length > 0 ? 'visible' : 'hidden'
        }
        onClick={(e) => {
          e.stopPropagation();
          node.toggle();
        }}
        sx={{
          // direction is down if open, right if closed
          maxWidth: '20px',
          transform: node.isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          cursor: 'pointer',
        }}
      />
      {renderStatusIndicator()}
      <Typography
        level="title-sm"
        noWrap
        alignSelf="center"
        sx={{
          cursor: 'pointer',
        }}
      >
        {node.data.title ?? node.data.key}
      </Typography>
      <Box margin="auto"></Box>
      {progress !== undefined && (
        <Chip
          size="sm"
          sx={{
            backgroundColor: chipColor(progress),
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
    </Box>
  );
};
