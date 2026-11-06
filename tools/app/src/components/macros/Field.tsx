// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  Alert,
  Box,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import type { ReactNode } from 'react';
import type { MacroContext } from '.';
import { useCard, useCardMutations, useProject } from '@/lib/api';
import type { CardView } from '@/lib/api/types';
import { UserRole, useHasMinRole } from '@/lib/auth';
import type { MetadataValue, WorkflowTransition } from '@/lib/definitions';
import { fieldEditability } from '@/lib/fieldEditability';
import { useErrorNotification } from '@/lib/hooks';
import { emptyFieldText } from '@/lib/emptyFieldText';
import { findWorkflowForCardType } from '@/lib/utils';
import { FieldRow } from '@/components/card/metadata-section/FieldRow';
import {
  fieldRowFrameSx,
  containerRowSx,
  metadataBoxSx,
  rowQuery,
} from '@/components/fieldRowFrame';
import { FieldLabel } from '@/components/EditableField';
import { customFieldRow } from '@/components/card/metadata-section/customFieldRow';
import type { FieldRowData } from '@/components/card/metadata-section/customFieldRow';
import StateSelector from '@/components/StateSelector';
import InlineField from './InlineField';

export type FieldProps = {
  cardKey: string;
  field: string;
  showLabel: boolean;
  display: 'row' | 'inline';
} & MacroContext;

type FieldCard = Pick<
  CardView,
  'key' | 'title' | 'cardType' | 'workflowState' | 'fields' | 'deniedOperations'
>;

interface FieldViewProps {
  card: FieldCard;
  showLabel: boolean;
  display: FieldProps['display'];
  preview: boolean;
}

export default function Field({
  cardKey,
  field,
  display,
  showLabel,
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
    <WorkflowStateField
      card={card}
      showLabel={showLabel}
      display={display}
      preview={preview}
    />
  ) : (
    <ValueField
      card={card}
      field={field}
      showLabel={showLabel}
      display={display}
      preview={preview}
    />
  );
}

function ValueField({
  card,
  field,
  showLabel,
  display,
  preview,
}: FieldViewProps & { field: string }) {
  const { t } = useTranslation();
  const notify = useErrorNotification();
  const canEditRole = useHasMinRole(UserRole.Editor);
  const { updateCard } = useCardMutations(card.key);
  // Per macro, so opening one never closes or resets another.
  const [isEditing, setIsEditing] = useState(false);

  const customField = card.fields?.find((f) => f.key === field);
  const row: FieldRowData | undefined =
    field === 'title'
      ? { value: card.title, label: t('title'), dataType: 'shortText' }
      : customField && customFieldRow(customField);
  // The card type can change after the server rendered the placeholder.
  if (!row) {
    return (
      <MacroErrorAlert
        message={t('fieldMacro.notOnCardType', {
          field,
          cardType: card.cardType,
        })}
      />
    );
  }

  const editability = fieldEditability({
    card,
    fieldKey: field,
    canEditRole,
    readOnly: preview,
  });

  // Resolves true when saved; a failure is reported and leaves the editor open.
  const save = async (value: MetadataValue) =>
    (await notify(async () => {
      await updateCard({ metadata: { [field]: value } });
      return true;
    })) ?? false;

  if (display === 'inline') {
    return (
      <InlineField
        row={row}
        showLabel={showLabel}
        editability={editability}
        onSave={save}
      />
    );
  }

  return (
    <RowBox>
      <FieldRow
        expanded
        {...row}
        hideLabel={!showLabel}
        emptyText={emptyFieldText(t, {
          ...row,
          disabled: editability.disabled,
          display: 'row',
        })}
        isEditing={isEditing}
        disabled={editability.disabled}
        disabledReason={editability.reason}
        onStartEdit={() => setIsEditing(true)}
        onSave={async (value) => {
          if (await save(value)) setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    </RowBox>
  );
}

function WorkflowStateField({
  card,
  showLabel,
  display,
  preview,
}: FieldViewProps) {
  const { t } = useTranslation();
  const notify = useErrorNotification();
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
    await notify(() => updateWorkFlowState(transition.name));
  };

  const selector = (
    <Tooltip
      title={
        !canEditRole && !preview ? t('permissions.editorRequired') : undefined
      }
      describeChild
    >
      <span>
        <StateSelector
          currentState={currentState}
          workflow={workflow}
          onTransition={onTransition}
          compact
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
  );

  if (display === 'inline') {
    return (
      <Box
        component="span"
        data-cy="fieldMacro"
        role="group"
        aria-label={label}
      >
        {showLabel && (
          <Box component="span" sx={{ color: 'text.tertiary' }}>
            {label}:{' '}
          </Box>
        )}
        {selector}
      </Box>
    );
  }

  return (
    <RowBox>
      <Accordion
        expanded
        sx={{ ...fieldRowFrameSx, ...(!showLabel && { borderLeft: 0 }) }}
      >
        <AccordionDetails>
          <Stack
            role="group"
            aria-label={label}
            sx={[
              containerRowSx,
              {
                alignItems: 'flex-start',
                [rowQuery]: { alignItems: 'center' },
              },
            ]}
          >
            <FieldLabel
              label={label}
              edit={false}
              visuallyHidden={!showLabel}
            />
            <Typography component="div" level="body-xs">
              {selector}
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </RowBox>
  );
}

// What the grouping rules select, so they do not depend on generated classes.
const ROW_BOX_CLASS = 'field-macro-box';

/**
 * The row display's box, with the metadata panel's outline. Row macros that
 * follow each other in the content share one box: the `+` rule joins them.
 */
function RowBox({ children }: { children: ReactNode }) {
  return (
    <Box
      data-cy="fieldMacro"
      className={ROW_BOX_CLASS}
      sx={{
        ...metadataBoxSx,
        // Size containment removes the content width; this keeps a table cell usable.
        minWidth: '14rem',
        // Keeps a row's margins inside, so a group spaces rows like the panel.
        display: 'flow-root',
        // Inside a group only the outer edges keep border, corners and padding.
        [`.${ROW_BOX_CLASS} + &`]: {
          borderTopWidth: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          paddingTop: 0,
        },
        [`&:has(+ .${ROW_BOX_CLASS})`]: {
          borderBottomWidth: 0,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          paddingBottom: 0,
        },
      }}
    >
      {children}
    </Box>
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
