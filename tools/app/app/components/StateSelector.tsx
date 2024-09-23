/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useMemo } from 'react';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import {
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../lib/definitions';
import {
  Menu,
  MenuItem,
  ListItemContent,
  Dropdown,
  MenuButton,
  Typography,
  Box,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { getStateColor } from '../lib/utils';

interface StateSelectorProps {
  currentState: WorkflowState | null;
  workflow: Workflow | null;
  onTransition: (transition: WorkflowTransition) => void;
}

const StateSelector: React.FC<StateSelectorProps> = ({
  currentState,
  workflow,
  onTransition,
}) => {
  const { t } = useTranslation();

  const availableTransitions = useMemo(() => {
    if (
      !currentState ||
      !workflow ||
      !workflow.states.find((state) => state.name == currentState.name)
    ) {
      return null;
    }

    return workflow?.transitions.filter(
      (transition) =>
        transition.fromState.includes(currentState.name) ||
        transition.fromState.includes('*'),
    );
  }, [currentState, workflow]);

  if (!availableTransitions || !currentState) return null;

  return (
    <Dropdown>
      <MenuButton
        size="sm"
        disabled={availableTransitions.length == 0}
        variant="soft"
        startDecorator={
          <Box color={getStateColor(currentState)}>
            <FiberManualRecordIcon />
          </Box>
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
  );
};

export default StateSelector;
