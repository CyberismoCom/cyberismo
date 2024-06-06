import React, { useState } from 'react'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemText from '@mui/material/ListItemText'
import { green, grey, red, yellow } from '@mui/material/colors'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { Workflow, WorkflowState, WorkflowTransition } from '../lib/definitions'
import { Work } from '@mui/icons-material'
import { workflowCategory } from '../../../data-handler/src/interfaces/project-interfaces'

interface StateSelectorProps {
  currentState: WorkflowState | null
  workflow: Workflow | null
  onTransition: (transition: WorkflowTransition) => void
}

const StateSelector: React.FC<StateSelectorProps> = ({
  currentState,
  workflow,
  onTransition,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleMenuItemClick = (transition: WorkflowTransition) => {
    onTransition(transition)
    handleClose()
  }

  if (
    currentState == null ||
    workflow == null ||
    !workflow.states.find((state) => state.name == currentState.name)
  )
    return null

  const availableTransitions = workflow?.transitions.filter(
    (transition) =>
      (transition.fromState.includes(currentState.name) ||
        transition.fromState.includes('*')) &&
      transition.toState !== currentState.name
  )

  return (
    <div>
      <Button
        disabled={availableTransitions.length == 0}
        variant="contained"
        startIcon={
          <FiberManualRecordIcon
            style={{ color: getStateColor(currentState) }}
          />
        }
        onClick={handleClick}
        sx={{
          textTransform: 'none',
          color: 'black',
          backgroundColor: 'grey.100',
          whiteSpace: 'nowrap',
          pl: 2,
          pr: 2,
          marginLeft: 1,
        }}
      >
        <strong>Status: {currentState.name}</strong>
      </Button>
      <Menu
        id="status-menu"
        anchorEl={anchorEl}
        keepMounted
        open={open}
        onClose={handleClose}
      >
        {availableTransitions.map((transition) => (
          <MenuItem
            key={transition.name}
            onClick={() => handleMenuItemClick(transition)}
          >
            <ListItemText primary={transition.name} />
          </MenuItem>
        ))}
      </Menu>
    </div>
  )
}

function getStateColor(state: WorkflowState) {
  switch (state.category) {
    case workflowCategory.initial:
      return grey[600]
    case workflowCategory.active:
      return yellow[600]
    case workflowCategory.closed:
      return green[600]
    default:
      return 'black'
  }
}

export default StateSelector
