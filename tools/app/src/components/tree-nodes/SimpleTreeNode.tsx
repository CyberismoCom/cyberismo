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
import { NodeRendererProps, NodeApi } from 'react-arborist';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface SimpleNodeData {
  id: string;
  label: string;
  children?: SimpleNodeData[];
}

interface SimpleTreeNodeProps extends NodeRendererProps<SimpleNodeData> {
  onNodeClick?: (node: NodeApi<SimpleNodeData>) => void;
}

export const SimpleTreeNode = ({
  node,
  style,
  dragHandle,
  onNodeClick,
}: SimpleTreeNodeProps) => {
  return (
    <Box
      className="treenode"
      style={style}
      ref={dragHandle}
      onClick={(e) => {
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
      bgcolor={node.isSelected ? 'white' : 'transparent'}
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
      <Typography
        level="title-sm"
        noWrap
        alignSelf="center"
        sx={{
          cursor: 'pointer',
        }}
      >
        {node.data.label}
      </Typography>
    </Box>
  );
};
