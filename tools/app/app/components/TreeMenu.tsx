'use client'
import React from 'react'
import { Card, Project } from '../lib/definitions'
import { TreeView } from '@mui/x-tree-view/TreeView'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Link from 'next/link'
import { findPathTo } from '../lib/utils'
import { useRouter } from 'next/navigation'

type TreeMenuProps = {
  project: Project
  selectedCardKey: string | null
}

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
)

export const TreeMenu: React.FC<TreeMenuProps> = ({
  project,
  selectedCardKey,
}) => {
  // Expand the tree until selected node is visible OR expand the first level of the tree if no selection
  let expanded = selectedCardKey
    ? findPathTo(selectedCardKey, project.cards)?.map((card) => card.key) ?? []
    : project.cards.map((card) => card.key)

  const router = useRouter()
  const handleClick = (cardKey: string) => {
    router.push(`/cards/${cardKey}`)
  }

  return (
    <div className="navigationSidebar">
      <h3>{project.name}</h3>
      <TreeView
        className="treeView"
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        defaultExpanded={expanded}
        selected={selectedCardKey}
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
          }
        }}
      >
        {project.cards.map((treeItem) => renderTree(treeItem, handleClick))}
      </TreeView>
    </div>
  )
}
