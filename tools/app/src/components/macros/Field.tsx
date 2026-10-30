// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Stack, Tooltip, Typography } from '@mui/joy';
import type { MacroContext } from '.';
import { useCard, useCardMutations, useProject } from '@/lib/api';
import type { CardView } from '@/lib/api/types';
import { UserRole, useHasMinRole } from '@/lib/auth';
import type { MetadataValue, WorkflowTransition } from '@/lib/definitions';
import { fieldEditability } from '@/lib/fieldEditability';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { findWorkflowForCardType } from '@/lib/utils';
import { FieldRow } from '@/components/card/metadata-section/FieldRow';
import { customFieldRow } from '@/components/card/metadata-section/customFieldRow';
import StateSelector from '@/components/StateSelector';

export type FieldProps = {
  cardKey: string;
  field: string;
  showLabel?: boolean;
} & MacroContext;

type FieldCard = Pick<
  CardView,
  'key' | 'title' | 'cardType' | 'workflowState' | 'fields' | 'deniedOperations'
>;

interface FieldViewProps {
  card: FieldCard;
  showLabel: boolean;
  preview: boolean;
}

export default function Field({
  cardKey,
  field,
  showLabel = true,
  preview,
}: FieldProps) {
  const { t } = useTranslation();
  const { card, error } = useCard(cardKey);

  if (error) {
    return (
      <MacroErrorAlert
        message={t('fieldMacro.error', {
          message: error instanceof Error ? error.message : t('unknownError'),
        })}
      />
    );
  }
  if (!card) return null;

  return field === 'workflowState' ? (
    <WorkflowStateField card={card} showLabel={showLabel} preview={preview} />
  ) : (
    <ValueField
      card={card}
      field={field}
      showLabel={showLabel}
      preview={preview}
    />
  );
}

function ValueField({
  card,
  field,
  showLabel,
  preview,
}: FieldViewProps & { field: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canEditRole = useHasMinRole(UserRole.Editor);
  const { updateCard } = useCardMutations(card.key);
  // Per macro, so opening one never closes or resets another.
  const [isEditing, setIsEditing] = useState(false);

  const customField = card.fields?.find((f) => f.key === field);
  const row =
    field === 'title'
      ? { value: card.title, label: t('title'), dataType: 'shortText' as const }
      : customField && customFieldRow(customField);
  // The card type can change after the server rendered the placeholder.
  if (!row) {
    return <MacroErrorAlert message={t('fieldMacro.noValue', { field })} />;
  }

  const editability = fieldEditability({
    card,
    fieldKey: field,
    canEditRole,
    readOnly: preview,
  });

  const save = async (value: MetadataValue) => {
    try {
      await updateCard({ metadata: { [field]: value } });
      setIsEditing(false);
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : '',
          type: 'error',
        }),
      );
    }
  };

  return (
    <Box data-cy="fieldMacro">
      <FieldRow
        expanded
        {...row}
        hideLabel={!showLabel}
        isEditing={isEditing}
        disabled={editability.disabled}
        disabledReason={editability.reason}
        onStartEdit={() => setIsEditing(true)}
        onSave={save}
        onCancel={() => setIsEditing(false)}
      />
    </Box>
  );
}

function WorkflowStateField({ card, showLabel, preview }: FieldViewProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canEditRole = useHasMinRole(UserRole.Editor);
  const { project } = useProject();
  const { updateWorkFlowState, isUpdating } = useCardMutations(card.key);

  const workflow = project
    ? findWorkflowForCardType(card.cardType, project)
    : null;
  const currentState =
    workflow?.states.find((state) => state.name === card.workflowState) ?? null;
  const label = t('workflowState');

  // Sent as `state`, so the server's transition guards apply.
  const onTransition = async (transition: WorkflowTransition) => {
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
  };

  return (
    <Stack
      data-cy="fieldMacro"
      role="group"
      aria-label={label}
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ marginY: 0.5 }}
    >
      {showLabel && (
        <Typography level="body-xs" aria-hidden>
          {label}
        </Typography>
      )}
      <Tooltip
        title={t('permissions.editorRequired')}
        disableHoverListener={canEditRole || preview}
        describeChild
      >
        <span>
          <StateSelector
            currentState={currentState}
            workflow={workflow}
            onTransition={onTransition}
            deniedTransitions={card.deniedOperations.transition}
            isLoading={isUpdating('updateState')}
            disabled={
              preview ||
              !canEditRole ||
              (isUpdating() && !isUpdating('updateState'))
            }
          />
        </span>
      </Tooltip>
    </Stack>
  );
}

function MacroErrorAlert({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <Alert color="warning" variant="soft" sx={{ marginY: 1 }}>
      <div>
        <Typography level="title-sm">{t('fieldMacro.errorTitle')}</Typography>
        <Typography level="body-sm">{message}</Typography>
      </div>
    </Alert>
  );
}
