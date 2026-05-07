/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
