/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useMemo } from 'react';
import type {
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../lib/definitions';
import {
  Menu,
  MenuItem,
  ListItemContent,
  ListDivider,
  Dropdown,
  MenuButton,
  CircularProgress,
  Stack,
} from '@mui/joy';
import ArrowForward from '@mui/icons-material/ArrowForward';
import { useTranslation } from 'react-i18next';
import { getStateColor } from '../lib/utils';
import { getConfig } from '@/lib/utils';
import { ANY_STATE } from '@/lib/constants';

interface StateSelectorProps {
  currentState: WorkflowState | null;
  workflow: Workflow | null;
  onTransition: (transition: WorkflowTransition) => void;
  onViewWorkflow?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const StateSelector: React.FC<StateSelectorProps> = ({
  currentState,
  workflow,
  onTransition,
  onViewWorkflow,
  disabled,
  isLoading,
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
        transition.fromState.includes(ANY_STATE),
    );
  }, [currentState, workflow]);

  if (!availableTransitions || !currentState) return null;

  const statusDot = (
    <span
      style={{
        width: '16px',
        height: '16px',
        backgroundColor: getStateColor(currentState.category),
        borderRadius: '50%',
        marginRight: '2px',
      }}
    ></span>
  );

  const hasTransitions = availableTransitions.length > 0;
  const buttonDisabled =
    (!hasTransitions && !onViewWorkflow) ||
    (hasTransitions && disabled) ||
    getConfig().staticMode;

  return (
    <Dropdown>
      <MenuButton
        size="sm"
        disabled={buttonDisabled}
        variant="soft"
        color="neutral"
        endDecorator={!isLoading && statusDot}
      >
        {isLoading ? (
          <CircularProgress size="sm" />
        ) : (
          <div style={{ whiteSpace: 'nowrap' }}>
            {t('stateSelector.status', {
              state: currentState.name,
            })}
          </div>
        )}
      </MenuButton>
      <Menu>
        {availableTransitions.map((transition) => {
          const toState = workflow?.states.find(
            (state) => state.name === transition.toState,
          );
          return (
            <MenuItem
              key={transition.name}
              onClick={() => onTransition(transition)}
              disabled={disabled}
            >
              <ListItemContent>
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{transition.name}</span>
                  <ArrowForward fontSize="small" sx={{ opacity: 0.6 }} />
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: getStateColor(toState?.category),
                      flexShrink: 0,
                    }}
                  />
                  <span>{transition.toState}</span>
                </Stack>
              </ListItemContent>
            </MenuItem>
          );
        })}
        {onViewWorkflow && (
          <>
            {hasTransitions && <ListDivider />}
            <MenuItem onClick={onViewWorkflow} data-cy="viewWorkflowMenuItem">
              <ListItemContent>
                {t('workflowGraph.viewTooltip')}
              </ListItemContent>
            </MenuItem>
          </>
        )}
      </Menu>
    </Dropdown>
  );
};

export default StateSelector;
