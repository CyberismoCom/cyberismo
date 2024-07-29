/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import React, { useCallback, useEffect } from 'react';
import { Box, Button } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import { ProjectBreadcrumbs } from './ProjectBreadcrumbs';
import { CardMode, WorkflowTransition } from '../lib/definitions';
import StatusSelector from './StateSelector';
import CardContextMenu from './CardContextMenu';
import { findWorkflowForCard } from '../lib/utils';
import { useAppRouter } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import { useCard, useProject } from '../lib/api';
import { useAppDispatch } from '../lib/hooks';
import { addNotification } from '../lib/slices/notifications';

interface ContentToolbarProps {
  cardKey: string;
  mode: CardMode;
  onUpdate?: () => void;
}

const ContentToolbar: React.FC<ContentToolbarProps> = ({
  cardKey,
  mode,
  onUpdate,
}) => {
  const router = useAppRouter();
  const { t } = useTranslation();

  const { project } = useProject();
  const { card, updateWorkFlowState, isUpdating } = useCard(cardKey);

  const dispatch = useAppDispatch();

  const workflow = findWorkflowForCard(card, project);
  const currentState =
    workflow?.states.find(
      (state) => state.name == card?.metadata?.workflowState,
    ) ?? null;

  const onStateTransition = useCallback(
    async (transition: WorkflowTransition) => {
      try {
        await updateWorkFlowState(transition.name);
      } catch (error) {
        dispatch(
          addNotification({
            message: t('error.transition'),
            type: 'error',
          }),
        );
      }
    },
    [updateWorkFlowState, dispatch, t],
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Box sx={{ flexGrow: 1 }}>
        <ProjectBreadcrumbs selectedCard={card} project={project} />
      </Box>

      <CardContextMenu cardKey={cardKey} />

      {mode === CardMode.EDIT && (
        <Button
          variant="plain"
          aria-label="cancel"
          size="sm"
          color="neutral"
          style={{ marginLeft: 16, minWidth: 80 }}
          onClick={() => router.safeBack()}
        >
          {t('cancel')}
        </Button>
      )}

      <StatusSelector
        currentState={currentState}
        workflow={workflow}
        onTransition={(transition) => onStateTransition(transition)}
      />

      {mode === CardMode.VIEW && (
        <Button
          variant="solid"
          aria-label="edit"
          size="sm"
          startDecorator={<EditIcon />}
          style={{ marginLeft: 16, minWidth: 80 }}
          onClick={() => router.push(`/cards/${card!.key}/edit`)}
        >
          {t('edit')}
        </Button>
      )}

      {mode === CardMode.EDIT && (
        <Button
          variant="solid"
          size="sm"
          aria-label="update"
          style={{ marginLeft: 16, minWidth: 80 }}
          onClick={onUpdate}
          disabled={isUpdating}
        >
          {t('update')}
        </Button>
      )}
    </Box>
  );
};

export default ContentToolbar;
