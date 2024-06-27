'use client'
import React, { useCallback } from 'react'
import { Box, Button } from '@mui/joy'
import EditIcon from '@mui/icons-material/Edit'
import { ProjectBreadcrumbs } from './ProjectBreadcrumbs'
import { CardMode, WorkflowTransition } from '../lib/definitions'
import StatusSelector from './StateSelector'
import CardContextMenu from './CardContextMenu'
import { findWorkflowForCard } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useCard, useProject } from '../lib/api'
import { useAppDispatch } from '../lib/hooks'
import { addNotification } from '../lib/slices/notifications'

interface ContentToolbarProps {
  cardKey: string
  mode: CardMode
  onUpdate?: () => void
}

const ContentToolbar: React.FC<ContentToolbarProps> = ({
  cardKey,
  mode,
  onUpdate,
}) => {
  const router = useRouter()
  const { t } = useTranslation()

  const { project } = useProject()
  const { card, updateWorkFlowState } = useCard(cardKey)

  const dispatch = useAppDispatch()

  const workflow = findWorkflowForCard(card, project)
  const currentState =
    workflow?.states.find(
      (state) => state.name == card?.metadata?.workflowState
    ) ?? null

  const onStateTransition = useCallback(
    async (transition: WorkflowTransition) => {
      try {
        await updateWorkFlowState(transition.name)
      } catch (error) {
        dispatch(
          addNotification({
            message: t('error.transition'),
            type: 'error',
          })
        )
      }
    },
    [updateWorkFlowState, dispatch, t]
  )

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
          onClick={() => router.back()}
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
        >
          {t('update')}
        </Button>
      )}
    </Box>
  )
}

export default ContentToolbar
