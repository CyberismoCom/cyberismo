'use client'

import React from 'react'
import { Box, Button } from '@mui/joy'
import EditIcon from '@mui/icons-material/Edit'
import { ProjectBreadcrumbs } from './ProjectBreadcrumbs'
import {
  CardDetails,
  CardMode,
  Project,
  WorkflowTransition,
} from '../lib/definitions'
import StatusSelector from './StateSelector'
import CardContextMenu from './CardContextMenu'
import { findWorkflowForCard } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useCard } from '../lib/api'

interface ContentToolbarProps {
  cardKey: string
  project: Project | null
  mode: CardMode
  onUpdate: () => void
  onStateTransition: (transition: WorkflowTransition) => void
  onDelete?: (key: string, done: () => void) => void
}

const ContentToolbar: React.FC<ContentToolbarProps> = ({
  cardKey,
  project,
  mode,
  onUpdate,
  onStateTransition,
  onDelete,
}) => {
  const router = useRouter()
  const { t } = useTranslation()

  const { card } = useCard(cardKey)

  const workflow = findWorkflowForCard(card, project)
  const currentState =
    workflow?.states.find(
      (state) => state.name == card?.metadata?.workflowState
    ) ?? null

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Box sx={{ flexGrow: 1 }}>
        <ProjectBreadcrumbs selectedCard={card} project={project} />
      </Box>

      <CardContextMenu
        cardKey={cardKey}
        project={project}
        onDelete={onDelete}
      />

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
