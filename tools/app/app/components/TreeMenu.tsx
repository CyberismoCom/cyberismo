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
import { Card, Project, WorkflowState } from '../lib/definitions';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { findCard, findParentCard, getStateColor } from '../lib/utils';
import { Box, Stack, Typography } from '@mui/joy';
import { sortItems } from '@cyberismocom/data-handler/utils/lexorank';
import { Tree, NodeRendererProps, NodeApi } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { updateCard } from '../lib/api';
import { useAppRouter } from '../lib/hooks';
import { FiberManualRecord } from '@mui/icons-material';

type CardNode = Card & {
  workflowState: WorkflowState | undefined;
};

type TreeMenuProps = {
  title: string;
  project: Project;
  selectedCardKey: string | null;
  onCardSelect?: (node: NodeApi<CardNode>) => void;
  onMove?: (card: string, newParent: string, index: number) => void;
};

// since we aren't using buckets, 1 means that missing ranks will be last
function rankGetter(card: Card) {
  return card.metadata?.rank || '1|z';
}

const RenderTree = (onCardSelect?: (node: NodeApi<CardNode>) => void) =>
  function RenderNode({
    node,
    style,
    dragHandle,
  }: NodeRendererProps<CardNode>) {
    const router = useAppRouter();
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
        {node.data.children && node.data.children.length > 0 && (
          <ExpandMoreIcon
            sx={{
              // direction is down if open, right if closed
              transform: node.isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        )}
        {node.data.workflowState && (
          <Box
            color={getStateColor(node.data.workflowState)}
            display="flex"
            alignItems="center"
            alignSelf="center"
            width={10}
            height={10}
            marginRight={1}
          >
            <FiberManualRecord fontSize="inherit" />
          </Box>
        )}
        <Typography level="title-sm" noWrap alignSelf="center">
          {node.data.metadata?.title ?? node.data.key}
        </Typography>
      </Box>
    );
  };

export const TreeMenu: React.FC<TreeMenuProps> = ({
  project: { cards, workflows, cardTypes },
  selectedCardKey,
  title,
  onMove,
  onCardSelect,
}) => {
  const { ref, width, height } = useResizeObserver();

  // sort card at all levels
  const sortCards = (
    cards: Card[],
  ): (Card & {
    workflowState: WorkflowState | undefined;
  })[] => {
    return sortItems(cards, rankGetter).map((card) => {
      if (card.children) {
        card.children = sortCards(card.children);
      }
      const cardType = cardTypes.find(
        (type) => type.name === card.metadata?.cardtype,
      );
      const workflow = workflows.find(
        (workflow) => workflow.name === cardType?.workflow,
      );
      const workflowState = workflow?.states.find(
        (state) => state.name === card.metadata?.workflowState,
      );
      return {
        ...card,
        workflowState,
      };
    });
  };
  const sortedCards = sortCards(cards);

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
          data={sortedCards}
          openByDefault={false}
          idAccessor={(node) => node.key}
          selection={selectedCardKey || undefined}
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
