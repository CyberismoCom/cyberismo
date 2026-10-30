// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Stack } from '@mui/joy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MetadataValue } from '@/lib/definitions';
import type { CardView } from '@/lib/api/types';
import { getDefaultValue, metadataFieldRowId as fieldRowId } from '@/lib/utils';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { format } from 'date-fns';
import { FieldRow } from './FieldRow';
import { fieldEditability } from '@/lib/fieldEditability';
import { LABEL_SPLITTER } from '@/lib/constants';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';

export interface MetadataViewProps {
  initialExpanded?: boolean;
  card: CardView;
  onUpdate?: (update: {
    metadata: Record<string, MetadataValue>;
  }) => Promise<void>;
  focusFieldKey?: string | null;
  onFieldFocused?: () => void;
}

export default function MetadataSection({
  initialExpanded,
  card,
  onUpdate,
  focusFieldKey,
  onFieldFocused,
}: MetadataViewProps) {
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initialExpanded);
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canEditRole = useHasMinRole(UserRole.Editor);

  // A field with no visibility is hidden from the panel
  const panelFields = (card.fields ?? []).filter((f) => f.visibility != null);

  const focusFieldExists =
    !!focusFieldKey &&
    (focusFieldKey === 'labels' ||
      panelFields.some((f) => f.key === focusFieldKey));

  const [prevFocus, setPrevFocus] = useState({
    cardKey: card.key,
    focusFieldKey,
  });
  if (
    prevFocus.cardKey !== card.key ||
    prevFocus.focusFieldKey !== focusFieldKey
  ) {
    const cardChanged = prevFocus.cardKey !== card.key;
    setPrevFocus({ cardKey: card.key, focusFieldKey });
    if (cardChanged) {
      setEditingFieldKey(null);
    }
    if (focusFieldKey && focusFieldExists) {
      setExpanded(true);
      setEditingFieldKey(focusFieldKey);
    }
  }

  useEffect(() => {
    if (!focusFieldKey) return;
    if (focusFieldExists) {
      // Scroll after the state updates commit so the element is in its final layout.
      requestAnimationFrame(() => {
        const el = document.getElementById(fieldRowId(focusFieldKey));
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    onFieldFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFieldKey, card.key]);

  const canEdit = canEditRole && !!onUpdate;

  const notifyError = (error: unknown) => {
    dispatch(
      addNotification({
        message: error instanceof Error ? error.message : '',
        type: 'error',
      }),
    );
  };

  const handleSaveField = async (metadataKey: string, value: MetadataValue) => {
    if (!onUpdate) return;
    try {
      await onUpdate({ metadata: { [metadataKey]: value } });
      // A blur-triggered save resolves after the click that opened the next
      // field, so only close the editor if this field is still the open one.
      setEditingFieldKey((current) =>
        current === metadataKey ? null : current,
      );
    } catch (error) {
      notifyError(error);
    }
  };

  const handleAutoSaveLabels = async (value: MetadataValue) => {
    if (!onUpdate) return;
    try {
      await onUpdate({ metadata: { labels: value } });
    } catch (error) {
      notifyError(error);
    }
  };

  // Disable "Show Less" when the field being edited would be hidden by collapsing
  const editingFieldNeedsExpanded =
    editingFieldKey != null &&
    editingFieldKey !== 'labels' &&
    !panelFields.some(
      (f) => f.key === editingFieldKey && f.visibility === 'always',
    );

  return (
    <Box
      data-cy="metadataView"
      border="1px solid"
      borderColor="neutral.outlinedBorder"
      borderRadius={6}
      padding={{ xs: 1, sm: 1.5 }}
    >
      <Stack>
        <FieldRow
          expanded
          value={
            card.lastUpdated ? format(new Date(card.lastUpdated), 'PPp') : ''
          }
          label={t('lastUpdated')}
          dataType="dateTime"
          disabled
        />
        <FieldRow
          id={fieldRowId('labels')}
          expanded
          value={card.labels}
          label={t('labels')}
          dataType="label"
          disabled={!canEdit}
          isEditing={editingFieldKey === 'labels'}
          description={
            editingFieldKey === 'labels'
              ? t('labelEditor.splitterHint', { splitter: LABEL_SPLITTER })
              : undefined
          }
          onStartEdit={() => setEditingFieldKey('labels')}
          onAutoSave={handleAutoSaveLabels}
          onCancel={() => setEditingFieldKey(null)}
        />
        {panelFields.map(
          ({
            key,
            dataType,
            enumValues,
            fieldDisplayName,
            fieldDescription,
            visibility,
            isOverridable,
            value,
            calculatedValue,
            overrideValue,
          }) => {
            const editability = fieldEditability({
              card,
              fieldKey: key,
              canEditRole,
              readOnly: !onUpdate,
            });
            return (
              <FieldRow
                key={key}
                id={fieldRowId(key)}
                expanded={visibility === 'always' || expanded}
                value={getDefaultValue(value)}
                overrideMode={isOverridable}
                overrideValue={
                  isOverridable
                    ? getDefaultValue(overrideValue ?? null)
                    : undefined
                }
                calculatedValue={
                  isOverridable
                    ? getDefaultValue(calculatedValue ?? null)
                    : undefined
                }
                label={fieldDisplayName || key}
                dataType={dataType}
                description={fieldDescription}
                enumValues={enumValues}
                isEditing={editingFieldKey === key}
                disabled={editability.disabled}
                disabledReason={editability.reason}
                onStartEdit={() => setEditingFieldKey(key)}
                onSave={(val) => handleSaveField(key, val)}
                onCancel={() => setEditingFieldKey(null)}
              />
            );
          },
        )}
        <FieldRow
          expanded={expanded}
          value={card.cardTypeDisplayName || card.cardType}
          label={t('cardType')}
          dataType="shortText"
          disabled
        />
        <FieldRow
          expanded={expanded}
          value={
            card.createdAt ? format(new Date(card.createdAt), 'PPp') : null
          }
          label={t('createdAt')}
          dataType="dateTime"
          disabled
        />
        <Button
          data-cy="showMoreButton"
          variant="plain"
          color="primary"
          size="sm"
          disabled={expanded && editingFieldNeedsExpanded}
          endDecorator={
            <ExpandMoreIcon
              sx={{
                transition: 'transform 0.2s',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          }
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          sx={(theme) => ({
            alignSelf: 'flex-end',
            [theme.breakpoints.down('sm')]: {
              paddingBlock: 0,
              minHeight: 'auto',
            },
          })}
        >
          {expanded ? t('showLess') : t('showMore')}
        </Button>
      </Stack>
    </Box>
  );
}
