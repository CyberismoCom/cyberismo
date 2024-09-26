/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getString, getStateColor } from '../lib/utils';
import { Box, Stack, Typography } from '@mui/joy';
import { Tree, NodeRendererProps, NodeApi } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { FiberManualRecord } from '@mui/icons-material';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';

type TreeMenuProps = {
  title: string;
  selectedCardKey: string | null;
  onCardSelect?: (node: NodeApi<QueryResult<'tree'>>) => void;
  onMove?: (card: string, newParent: string, index: number) => void;
  tree: QueryResult<'tree'>[];
};

const RenderTree = (
  onCardSelect?: (node: NodeApi<QueryResult<'tree'>>) => void,
) =>
  function RenderNode({
    node,
    style,
    dragHandle,
  }: NodeRendererProps<QueryResult<'tree'>>) {
    return (
      <Box
        style={style}
        ref={dragHandle}
        onClick={(e) => {
          e.stopPropagation();
          node.toggle();
          onCardSelect?.(node);
        }}
        alignContent="center"
        display="flex"
        bgcolor={node.isSelected ? 'primary.softActiveBg' : 'transparent'}
      >
        {node.children && node.children.length > 0 && (
          <ExpandMoreIcon
            sx={{
              // direction is down if open, right if closed
              transform: node.isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        )}
        <div>{node.data['base/fieldtypes/progress']}</div>
        {node.data.workflowStateCategory && (
          <Box
            color={getStateColor(node.data.workflowStateCategory)}
            display="flex"
            alignItems="center
              "
            alignSelf="center"
            width={10}
            height={10}
            marginRight={1}
          >
            <FiberManualRecord fontSize="inherit" />
          </Box>
        )}
        <Typography level="title-sm" noWrap alignSelf="center">
          {node.data.title ?? node.data.key}
        </Typography>
      </Box>
    );
  };

export const TreeMenu: React.FC<TreeMenuProps> = ({
  selectedCardKey,
  title,
  onMove,
  onCardSelect,
  tree,
}) => {
  const { ref, width, height } = useResizeObserver();

  return (
    <Stack
      paddingTop={2}
      paddingLeft={2}
      bgcolor="#f0f0f0"
      height="100%"
      width="100%"
    >
      <Typography level="h4">{title}</Typography>
      <Box
        sx={{
          flexGrow: 1,
        }}
        ref={ref}
      >
        <Tree
          data={tree}
          openByDefault={false}
          idAccessor={(node) => node.key}
          selection={selectedCardKey || undefined}
          childrenAccessor="results"
          indent={24}
          width={(width || 0) - 1}
          height={height}
          onMove={(n) => {
            if (onMove && n.dragIds.length === 1) {
              onMove(n.dragIds[0], n.parentId ?? 'root', n.index);
            }
          }}
        >
          {RenderTree(onCardSelect)}
        </Tree>
      </Box>
    </Stack>
  );
};
