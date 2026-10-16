// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useState } from 'react';
import { IconButton, Tooltip } from '@mui/joy';
import AddLink from '@mui/icons-material/AddLink';
import { ProjectBreadcrumbs } from '../ProjectBreadcrumbs';
import StatusSelector from '../StateSelector';
import { findWorkflowForCardType } from '../../lib/utils';
import type { WorkflowTransition } from '../../lib/definitions';
import { useTranslation } from 'react-i18next';
import {
  useCard,
  useCardUpdates,
  usePresence,
  useProject,
  useTree,
  useUser,
  useWorkflowGraph,
} from '../../lib/api';
import { useAppDispatch } from '../../lib/hooks';
import { addNotification } from '../../lib/slices/notifications';
import BaseToolbar from './BaseToolbar';
import { CardContextMenu } from '@/components/context-menus';
import PresenceIndicator from '@/components/PresenceIndicator';
import SvgViewerModal from '@/components/modals/svgViewerModal';
import { UserRole, useHasMinRole } from '@/lib/auth';

interface CardToolbarProps {
  cardKey: string;
  linkButtonDisabled?: boolean;
  onInsertLink?: () => void;
  afterDelete?: () => void;
  onAttachmentAdded?: () => void;
  presenceMode?: 'viewing' | 'editing';
}

export function CardToolbar({
  cardKey,
  onInsertLink,
  afterDelete,
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
  useCardUpdates(cardKey, presenceMode);

  const dispatch = useAppDispatch();
  const canEdit = useHasMinRole(UserRole.Editor);

  const workflow =
    project && card ? findWorkflowForCardType(card.cardType, project) : null;
  const currentState =
    workflow?.states.find((state) => state.name == card?.workflowState) ?? null;

  const [workflowGraphOpen, setWorkflowGraphOpen] = useState(false);
  const { workflowGraph } = useWorkflowGraph(
    workflowGraphOpen ? (workflow?.name ?? null) : null,
    cardKey,
  );
  const workflowGraphMarkup = workflowGraph?.svg ? atob(workflowGraph.svg) : '';

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
      {canEdit && (
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
        onViewWorkflow={workflow ? () => setWorkflowGraphOpen(true) : undefined}
        isLoading={isUpdating('updateState')}
        disabled={!canEdit || (isUpdating() && !isUpdating('updateState'))}
      />

      <SvgViewerModal
        open={workflowGraphOpen && Boolean(workflowGraphMarkup)}
        svgMarkup={workflowGraphMarkup}
        onClose={() => setWorkflowGraphOpen(false)}
      />
    </>
  );

  return (
    <BaseToolbar
      breadcrumbs={breadcrumbs}
      contextMenu={
        canEdit && (
          <>
            <PresenceIndicator presence={presence} currentUserId={user?.id} />
            <CardContextMenu
              cardKey={cardKey}
              afterDelete={afterDelete}
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
