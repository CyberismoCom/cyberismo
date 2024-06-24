'use client'
import React, { useEffect } from 'react'
import { Card, Project } from '../lib/definitions'
import { TreeView } from '@mui/x-tree-view/TreeView'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { findPathTo } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { Stack, Typography } from '@mui/joy'

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
  const [expanded, setExpanded] = React.useState<string[]>([])

  // Expand the tree until selected node is visible OR expand the first level of the tree if no selection
  useEffect(() => {
    const defaultExpanded = selectedCardKey
      ? findPathTo(selectedCardKey, project.cards)?.map((card) => card.key) ??
        []
      : project.cards.map((card) => card.key)
    setExpanded(defaultExpanded)
  }, [project, selectedCardKey])

  const router = useRouter()
  const handleClick = (cardKey: string) => {
    router.push(`/cards/${cardKey}`)
  }

  return (
    <Stack padding={2} bgcolor="#f0f0f0" height="100%" width="100%">
      <Typography level="h4">{project.name}</Typography>
      <TreeView
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        expanded={expanded}
        selected={selectedCardKey}
        onNodeToggle={(_, nodes) => {
          setExpanded(nodes)
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
        {project.cards.map((treeItem) => renderTree(treeItem, handleClick))}
      </TreeView>
    </Stack>
  )
}
