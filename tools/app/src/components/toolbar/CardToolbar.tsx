/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useCallback } from 'react';
import { Button, IconButton, Tooltip } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import InsertLink from '@mui/icons-material/InsertLink';
import { ProjectBreadcrumbs } from '../ProjectBreadcrumbs';
import type { WorkflowTransition } from '../../lib/definitions';
import { CardMode } from '../../lib/definitions';
import StatusSelector from '../StateSelector';
import { findWorkflowForCardType } from '../../lib/utils';
import { useAppRouter, useAppSelector } from '../../lib/hooks';
import { useTranslation } from 'react-i18next';
import {
  useCard,
  usePresence,
  useProject,
  useTree,
  useUser,
} from '../../lib/api';
import { useAppDispatch } from '../../lib/hooks';
import { addNotification } from '../../lib/slices/notifications';
import BaseToolbar from './BaseToolbar';
import { CardContextMenu } from '@/components/context-menus';
import PresenceIndicator from '@/components/PresenceIndicator';
import { useCanEdit } from '@/lib/auth';

interface CardToolbarProps {
  cardKey: string;
  mode: CardMode;
  linkButtonDisabled?: boolean;
  onUpdate?: () => void;
  onInsertLink?: () => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

export function CardToolbar({
  cardKey,
  mode,
  onUpdate,
  onInsertLink,
  onCancel,
  linkButtonDisabled,
  readOnly,
}: CardToolbarProps) {
  const router = useAppRouter();
  const { t } = useTranslation();

  const { project } = useProject();
  const { tree } = useTree();
  const isEdited = useAppSelector((state) => state.page.isEdited);
  const { card, updateWorkFlowState, isUpdating } = useCard(cardKey);
  const { user } = useUser();
  const presenceMode = mode === CardMode.EDIT ? 'editing' : 'viewing';
  const presence = usePresence(cardKey, presenceMode);

  const dispatch = useAppDispatch();
  const canEdit = useCanEdit();

  const workflow =
    project && card ? findWorkflowForCardType(card.cardType, project) : null;
  const currentState =
    workflow?.states.find((state) => state.name == card?.workflowState) ?? null;

  const onStateTransition = useCallback(
    async (transition: WorkflowTransition) => {
      try {
        await updateWorkFlowState(transition.name);
      } catch (error) {
        dispatch(
          addNotification({
            message: error instanceof Error ? error.message : t('unknownError'),
            type: 'error',
          }),
        );
      }
    },
    [updateWorkFlowState, dispatch, t],
  );

  const breadcrumbs = <ProjectBreadcrumbs cardKey={cardKey} tree={tree} />;

  const actions = (
    <>
      {mode === CardMode.VIEW && canEdit && (
        <Tooltip title={t('linkTooltip')} placement="top">
          <IconButton
            onClick={onInsertLink}
            size="sm"
            variant="plain"
            style={{ marginRight: 8, minWidth: 40 }}
            data-cy="linkIconButton"
            disabled={
              linkButtonDisabled ||
              isUpdating() ||
              !tree ||
              tree.length === 0 ||
              (tree.length === 1 &&
                (!tree[0]?.children || tree[0]?.children.length === 0))
            }
          >
            <InsertLink />
          </IconButton>
        </Tooltip>
      )}

      <StatusSelector
        currentState={currentState}
        workflow={workflow}
        onTransition={(transition) => onStateTransition(transition)}
        isLoading={isUpdating('updateState')}
        disabled={!canEdit || (isUpdating() && !isUpdating('updateState'))}
      />

      {mode === CardMode.VIEW && canEdit && (
        <Button
          variant="solid"
          aria-label="edit"
          data-cy="editButton"
          size="sm"
          startDecorator={<EditIcon />}
          style={{ marginLeft: 8, minWidth: 80 }}
          onClick={() => router.push(`/cards/${cardKey}/edit`)}
          disabled={isUpdating()}
        >
          {t('edit')}
        </Button>
      )}

      {mode === CardMode.EDIT && (
        <>
          <Button
            id="cancelButton"
            variant="plain"
            aria-label="cancel"
            size="sm"
            color="neutral"
            style={{ marginLeft: 8, minWidth: 80 }}
            onClick={onCancel}
            disabled={isUpdating() || readOnly}
          >
            {t('cancel')}
          </Button>

          <Button
            variant="solid"
            size="sm"
            aria-label="update"
            data-cy="updateButton"
            style={{ marginLeft: 8, minWidth: 80 }}
            onClick={onUpdate}
            loading={isUpdating('update')}
            disabled={
              (isUpdating() && !isUpdating('update')) || readOnly || !isEdited
            }
          >
            {t('update')}
          </Button>
        </>
      )}
    </>
  );

  return (
    <BaseToolbar
      breadcrumbs={breadcrumbs}
      contextMenu={
        canEdit && (
          <>
            <PresenceIndicator presence={presence} currentUserId={user?.id} />
            <CardContextMenu cardKey={cardKey} />
          </>
        )
      }
      actions={actions}
    />
  );
}

export default CardToolbar;
