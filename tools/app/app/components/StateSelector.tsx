import React, { useMemo } from 'react'
import colors from '@mui/joy/colors'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { Workflow, WorkflowState, WorkflowTransition } from '../lib/definitions'
import { workflowCategory } from '../../../data-handler/src/interfaces/project-interfaces'
import {
  Menu,
  MenuItem,
  ListItemContent,
  Dropdown,
  MenuButton,
  Typography,
} from '@mui/joy'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()

  const availableTransitions = useMemo(() => {
    if (
      !currentState ||
      !workflow ||
      !workflow.states.find((state) => state.name == currentState.name)
    ) {
      return null
    }

    return workflow?.transitions.filter(
      (transition) =>
        transition.fromState.includes(currentState.name) ||
        transition.fromState.includes('*')
    )
  }, [currentState, workflow])

  if (!availableTransitions || !currentState) return null

  return (
    <Dropdown>
      <MenuButton
        size="sm"
        disabled={availableTransitions.length == 0}
        variant="soft"
        startDecorator={
          <FiberManualRecordIcon
            style={{ color: getStateColor(currentState) }}
          />
        }
      >
        <Typography fontWeight={600}>
          {t('stateSelector.status', {
            state: currentState.name,
          })}
        </Typography>
      </MenuButton>
      <Menu>
        {availableTransitions.map((transition) => (
          <MenuItem
            key={transition.name}
            onClick={() => onTransition(transition)}
          >
            <ListItemContent>{transition.name}</ListItemContent>
          </MenuItem>
        ))}
      </Menu>
    </Dropdown>
  )
}

function getStateColor(state: WorkflowState) {
  switch (state.category) {
    case workflowCategory.initial:
      return colors.grey[600]
    case workflowCategory.active:
      return colors.yellow[600]
    case workflowCategory.closed:
      return colors.green[600]
    default:
      return 'black'
  }
}

export default StateSelector
