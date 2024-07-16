/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useEffect } from 'react';
import { Card } from '../lib/definitions';
import { TreeView } from '@mui/x-tree-view/TreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { findPathTo } from '../lib/utils';
import { Stack, Typography } from '@mui/joy';

type TreeMenuProps = {
  title: string;
  cards: Card[];
  selectedCardKey: string | null;
  onCardSelect?: (cardKey: string) => void;
};

const renderTree = (nodes: Card, handleClick: (cardKey: string) => void) => (
  <TreeItem
    key={nodes.key}
    nodeId={nodes.key}
    onClick={() => handleClick(nodes.key)}
    label={nodes.metadata?.summary ?? nodes.key}
  >
    {Array.isArray(nodes.children)
      ? nodes.children.map((node) => renderTree(node, handleClick))
      : null}
  </TreeItem>
);

export const TreeMenu: React.FC<TreeMenuProps> = ({
  cards,
  selectedCardKey,
  title,
  onCardSelect,
}) => {
  const [expanded, setExpanded] = React.useState<string[]>([]);

  // Expand the tree until selected node is visible OR expand the first level of the tree if no selection
  useEffect(() => {
    const defaultExpanded = selectedCardKey
      ? findPathTo(selectedCardKey, cards)?.map((card) => card.key) ?? []
      : cards.map((card) => card.key);
    setExpanded(defaultExpanded);
  }, [selectedCardKey, cards]);

  return (
    <Stack padding={2} bgcolor="#f0f0f0" height="100%" width="100%">
      <Typography level="h4">{title}</Typography>
      <TreeView
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        expanded={expanded}
        selected={selectedCardKey}
        onNodeToggle={(_, nodes) => {
          setExpanded(nodes);
        }}
        sx={{
          '& .MuiTreeItem-root': {
            mt: '6px', // Adds margin at the bottom of each TreeItem
            '& .MuiTreeItem-iconContainer': {
              marginRight: '2px',
            },
          },
          '& .MuiTreeItem-label': {
            fontSize: '1.0em',
            lineHeight: '1.3em',
          },
          overflowY: 'scroll',
          scrollbarWidth: 'thin',
          flexGrow: 1,
        }}
      >
        {cards.map((treeItem) =>
          renderTree(treeItem, onCardSelect || (() => {})),
        )}
      </TreeView>
    </Stack>
  );
};
