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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { hasResourceData } from '@/lib/api/resources';
import type { AnyNode } from '@/lib/api/types';
import { useTranslation } from 'react-i18next';
import { useTreeNodeVisualState } from '../../lib/hooks';

interface ConfigTreeNodeProps extends NodeRendererProps<AnyNode> {
  onNodeClick?: (node: NodeApi<AnyNode>) => void;
}

function identifier(name: string) {
  const parts = name.split('/');
  return parts[parts.length - 1];
}

function getResourceName(node: NodeApi<AnyNode>, t: (key: string) => string) {
  const resourceData = hasResourceData(node.data) ? node.data.data : null;
  if (node.data.type === 'module') {
    return node.data.name;
  }
  if (node.data.type === 'card') {
    return node.data.data.metadata?.title || node.data.data.key;
  }
  if (node.data.type === 'file') {
    return t(`configTree.files.${node.data.displayName}`);
  }
  if (node.data.type === 'resourceGroup' || node.data.type === 'modulesGroup') {
    return t(`resources.${node.data.name}`);
  }
  return resourceData?.displayName || identifier(node.data.name);
}

export const ConfigTreeNode = ({
  node,
  style,
  dragHandle,
  onNodeClick,
}: ConfigTreeNodeProps) => {
  const { t } = useTranslation();
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
        {getResourceName(node, t)}
      </Typography>
    </Box>
  );
};
