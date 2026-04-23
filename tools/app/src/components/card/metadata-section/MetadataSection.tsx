/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Stack } from '@mui/joy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MetadataValue } from '@/lib/definitions';
import type { CardResponse } from '@/lib/api/types';
import { getConfig, getDefaultValue } from '@/lib/utils';
import { format } from 'date-fns';
import { FieldRow } from './FieldRow';
import { LABEL_SPLITTER } from '@/lib/constants';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';

const FIELD_ROW_ID_PREFIX = 'metadata-field-';
const fieldRowId = (key: string) => `${FIELD_ROW_ID_PREFIX}${key}`;

export interface MetadataViewProps {
  initialExpanded?: boolean;
  card: CardResponse;
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

  useEffect(() => {
    setEditingFieldKey(null);
  }, [card.key]);

  useEffect(() => {
    if (!focusFieldKey) return;
    const fieldExists =
      focusFieldKey === 'labels' ||
      (card.fields ?? []).some((f) => f.key === focusFieldKey);
    if (!fieldExists) {
      onFieldFocused?.();
      return;
    }
    setExpanded(true);
    setEditingFieldKey(focusFieldKey);
    // Scroll after the state updates commit so the element is in its final layout.
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldRowId(focusFieldKey));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    onFieldFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFieldKey, card.key]);

  const canEdit = !getConfig().staticMode && !!onUpdate;

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
      setEditingFieldKey(null);
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
    !(card.fields ?? []).some(
      (f) => f.key === editingFieldKey && f.visibility === 'always',
    );

  return (
    <Box
      data-cy="metadataView"
      border="1px solid"
      borderColor="neutral.outlinedBorder"
      borderRadius={6}
      padding={2}
      display="flex"
      flexDirection="row"
    >
      <Stack flexGrow={1}>
        {(card.fields ?? []).map(
          ({
            key,
            dataType,
            enumValues,
            fieldDisplayName,
            fieldDescription,
            visibility,
            isCalculated,
            value,
          }) => (
            <FieldRow
              key={key}
              id={fieldRowId(key)}
              expanded={visibility === 'always' || expanded}
              value={getDefaultValue(value)}
              label={fieldDisplayName || key}
              dataType={dataType}
              description={fieldDescription}
              enumValues={enumValues}
              isEditing={editingFieldKey === key}
              disabled={
                !canEdit ||
                isCalculated ||
                card.deniedOperations.editField
                  .map((f) => f.fieldName)
                  .includes(key)
              }
              onStartEdit={() => setEditingFieldKey(key)}
              onSave={(val) => handleSaveField(key, val)}
              onCancel={() => setEditingFieldKey(null)}
            />
          ),
        )}
        <FieldRow
          expanded={expanded}
          value={card.cardTypeDisplayName || card.cardType}
          label={t('cardType')}
          dataType="shortText"
          disabled
        />
        <FieldRow
          id={fieldRowId('labels')}
          expanded={expanded}
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
        <FieldRow
          expanded={expanded}
          value={
            card.createdAt ? format(new Date(card.createdAt), 'PPp') : null
          }
          label={t('createdAt')}
          dataType="dateTime"
          disabled
        />
        <FieldRow
          expanded={expanded}
          value={
            card.lastUpdated ? format(new Date(card.lastUpdated), 'PPp') : ''
          }
          label={t('lastUpdated')}
          dataType="dateTime"
          disabled
        />
      </Stack>
      <Stack flexShrink={0} paddingLeft={1}>
        <Box flexGrow={1} />
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
        >
          {expanded ? t('showLess') : t('showMore')}
        </Button>
      </Stack>
    </Box>
  );
}
