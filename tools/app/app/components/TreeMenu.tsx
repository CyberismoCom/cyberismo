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
import { Card } from '../lib/definitions';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { findCard, findParentCard } from '../lib/utils';
import { Box, Stack, Typography } from '@mui/joy';
import { sortItems } from '@cyberismocom/data-handler/utils/lexorank';
import { Tree, NodeRendererProps } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { updateCard } from '../lib/api';

type TreeMenuProps = {
  title: string;
  cards: Card[];
  selectedCardKey: string | null;
  onCardSelect?: (cardKey: string) => void;
  onMove?: (card: string, newParent: string, index: number) => void;
};

// since we aren't using buckets, 1 means that missing ranks will be last
function rankGetter(card: Card) {
  return card.metadata?.rank || '1|z';
}

const renderTree = ({ node, style, dragHandle }: NodeRendererProps<Card>) => (
  <Box
    style={style}
    ref={dragHandle}
    onClick={() => {
      node.toggle();
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
    <Typography level="title-sm" noWrap alignSelf="center">
      {node.data.metadata?.summary ?? node.data.key}
    </Typography>
  </Box>
);

export const TreeMenu: React.FC<TreeMenuProps> = ({
  cards,
  selectedCardKey,
  title,
  onCardSelect,
}) => {
  const { ref, width, height } = useResizeObserver();

  // sort card at all levels
  const sortCards = (cards: Card[]): Card[] => {
    return sortItems(cards, rankGetter).map((card) => {
      if (card.children) {
        card.children = sortCards(card.children);
      }
      return card;
    });
  };
  cards = sortCards(cards);

  const onMove = async (cardKey: string, newParent: string, index: number) => {
    const card = findCard(cards, cardKey);
    if (!card) return;
    const parent = findParentCard(cards, cardKey);
    await updateCard(cardKey, {
      parent: newParent === parent?.key ? undefined : newParent,
      index,
    });
  };
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
          data={cards}
          openByDefault={false}
          onSelect={(nodes) =>
            nodes.length > 0 && onCardSelect && onCardSelect(nodes[0].data.key)
          }
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
          {renderTree}
        </Tree>
      </Box>
    </Stack>
  );
};
