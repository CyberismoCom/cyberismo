// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box } from '@mui/joy';
import type { NodeRendererProps, NodeApi } from 'react-arborist';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTreeNodeVisualState } from '../../lib/hooks';

interface BaseTreeNodeProps<T> extends NodeRendererProps<T> {
  onNodeClick?: (node: NodeApi<T>) => void;
  children: React.ReactNode;
}

export const BaseTreeNode = <T,>({
  node,
  style,
  dragHandle,
  onNodeClick,
  children,
}: BaseTreeNodeProps<T>) => {
  const visualState = useTreeNodeVisualState(node);

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
          maxWidth: '20px',
          transform: node.isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          cursor: 'pointer',
        }}
      />
      {children}
    </Box>
  );
};
