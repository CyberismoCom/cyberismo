'use client'

import React, { useState } from 'react'
import { Box, Button, Toolbar, Snackbar, Alert } from '@mui/material'
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
import { findWorkflowForCard, useError } from '../lib/utils'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'

interface ContentToolbarProps {
  selectedCard: CardDetails | null
  project: Project | null
  mode: CardMode
  onUpdate: () => void
  onStateTransition: (transition: WorkflowTransition) => void
}

const ContentToolbar: React.FC<ContentToolbarProps> = ({
  selectedCard,
  project,
  mode,
  onUpdate,
  onStateTransition,
}) => {
  const router = useRouter()
  const { t } = useTranslation()

  const workflow = findWorkflowForCard(selectedCard, project)
  const currentState =
    workflow?.states.find(
      (state) => state.name == selectedCard?.metadata?.workflowState
    ) ?? null

  return (
    <Toolbar disableGutters sx={{ display: 'flex', alignItems: 'top' }}>
      <Box sx={{ flexGrow: 1 }}>
        <ProjectBreadcrumbs selectedCard={selectedCard} project={project} />
      </Box>

      <CardContextMenu card={selectedCard} />

      {mode === CardMode.EDIT && (
        <Button
          variant="text"
          aria-label="cancel"
          style={{ marginLeft: 16, minWidth: 80, color: 'grey' }}
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
          variant="contained"
          aria-label="edit"
          startIcon={<EditIcon />}
          style={{ marginLeft: 16, minWidth: 80 }}
          onClick={() => router.push(`/cards/${selectedCard!.key}/edit`)}
        >
          {t('edit')}
        </Button>
      )}

      {mode === CardMode.EDIT && (
        <Button
          variant="contained"
          aria-label="update"
          style={{ marginLeft: 16, minWidth: 80 }}
          onClick={onUpdate}
        >
          {t('update')}
        </Button>
      )}
    </Toolbar>
  )
}

export default ContentToolbar
