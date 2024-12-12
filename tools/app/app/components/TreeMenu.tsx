/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useEffect, useRef } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getStateColor } from '../lib/utils';
import { Box, Chip, Stack, Typography } from '@mui/joy';
import { Tree, NodeRendererProps, NodeApi, TreeApi } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { FiberManualRecord } from '@mui/icons-material';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';
import Link from 'next/link';

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
    const progress = node.data['base/fieldTypes/progress'];

    return (
      <Box
        className="treenode"
        style={style}
        ref={dragHandle}
        onClick={(e) => {
          e.stopPropagation();
          if (node.isClosed) node.toggle();
          onCardSelect?.(node);
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
        {node.data.workflowStateCategory && (
          // Status color circle
          <Box
            color={getStateColor(node.data.workflowStateCategory)}
            visibility={progress ? 'hidden' : 'visible'}
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
        )}
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

export const TreeMenu: React.FC<TreeMenuProps> = ({
  selectedCardKey,
  title,
  onMove,
  onCardSelect,
  tree,
}) => {
  const { ref, width, height } = useResizeObserver();
  const treeRef = useRef();

  useEffect(() => {
    // unfortunately react arborist does not provide a type for the ref
    const tree = treeRef.current as unknown as TreeApi<QueryResult<'tree'>>;
    if (tree) {
      tree.select(selectedCardKey);
    }
  }, [selectedCardKey, tree]);

  return (
    <Stack
      paddingTop={2}
      paddingLeft={2}
      bgcolor="#f0f0f0"
      height="100%"
      width="100%"
    >
      <Link href="/cards" style={{ textDecoration: 'none' }}>
        <Typography level="h4" marginBottom={2}>
          {title}
        </Typography>
      </Link>
      <Box
        sx={{
          flexGrow: 1,
        }}
        ref={ref}
      >
        <Tree
          ref={treeRef}
          data={tree}
          openByDefault={false}
          idAccessor={(node) => node.key}
          childrenAccessor="children"
          indent={16}
          width={(width || 0) - 1}
          height={height}
          rowHeight={28}
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

const chipColor = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 'neutral';
  if (parsed === 0) return 'neutral.300';
  else if (parsed === 100) return 'success.400';
  else return 'warning.300';
};
