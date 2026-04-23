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
import { IconButton, Tooltip } from '@mui/joy';
import AddLink from '@mui/icons-material/AddLink';
import { ProjectBreadcrumbs } from '../ProjectBreadcrumbs';
import StatusSelector from '../StateSelector';
import { findWorkflowForCardType } from '../../lib/utils';
import type { WorkflowTransition } from '../../lib/definitions';
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
import { getConfig } from '@/lib/utils';
import BaseToolbar from './BaseToolbar';
import { CardContextMenu } from '@/components/context-menus';
import PresenceIndicator from '@/components/PresenceIndicator';

interface CardToolbarProps {
  cardKey: string;
  linkButtonDisabled?: boolean;
  onInsertLink?: () => void;
  onAttachmentAdded?: () => void;
  presenceMode?: 'viewing' | 'editing';
}

export function CardToolbar({
  cardKey,
  onInsertLink,
  linkButtonDisabled,
  onAttachmentAdded,
  presenceMode = 'viewing',
}: CardToolbarProps) {
  const { t } = useTranslation();

  const { project } = useProject();
  const { tree } = useTree();
  const { card, updateWorkFlowState, isUpdating } = useCard(cardKey);
  const { user } = useUser();
  const presence = usePresence(cardKey, presenceMode);

  const dispatch = useAppDispatch();

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
      {!getConfig().staticMode && (
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
            <AddLink />
          </IconButton>
        </Tooltip>
      )}

      <StatusSelector
        currentState={currentState}
        workflow={workflow}
        onTransition={(transition) => onStateTransition(transition)}
        isLoading={isUpdating('updateState')}
        disabled={isUpdating() && !isUpdating('updateState')}
      />
    </>
  );

  return (
    <BaseToolbar
      breadcrumbs={breadcrumbs}
      contextMenu={
        !getConfig().staticMode && (
          <>
            <PresenceIndicator presence={presence} currentUserId={user?.id} />
            <CardContextMenu
              cardKey={cardKey}
              onAttachmentAdded={onAttachmentAdded}
            />
          </>
        )
      }
      actions={actions}
    />
  );
}

export default CardToolbar;
