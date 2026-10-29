// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box, Stack } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import {
  coerceMetadataValue,
  getDefaultValue,
  metadataFieldRowId,
} from '@/lib/utils';
import type { CardResponse } from '@/lib/api/types';
import type { MetadataValue } from '@/lib/definitions';
import { MetadataFieldRow } from './MetadataFieldRow';
import { LABELS_KEY } from './draft';

export function MetadataFields({
  card,
  draft,
  editable,
  onChange,
  onSave,
  onCancel,
}: {
  card: CardResponse;
  draft: Record<string, MetadataValue>;
  editable: boolean;
  onChange: (key: string, value: MetadataValue) => void;
  onSave: (metadataKey: string, value: MetadataValue) => void;
  onCancel: (key: string, savedValue: MetadataValue) => void;
}) {
  const { t } = useTranslation();
  const savedLabels = card.labels ?? [];
  const deniedFields = (card.deniedOperations.editField ?? []).map(
    (d) => d.fieldName,
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
        <MetadataFieldRow
          id={metadataFieldRowId(LABELS_KEY)}
          label={t('labels')}
          dataType="label"
          value={draft[LABELS_KEY]}
          saved={savedLabels}
          editable={editable}
          onChange={(raw) =>
            onChange(LABELS_KEY, coerceMetadataValue(raw, 'label'))
          }
          onSave={() => onSave('labels', draft[LABELS_KEY])}
          onCancel={() => onCancel(LABELS_KEY, savedLabels)}
        />
        {(card.fields ?? []).map((f) => {
          const rowEditable =
            editable &&
            (!f.isCalculated || f.isOverridable) &&
            !deniedFields.includes(f.key);
          const saved = getDefaultValue(f.value);
          // A calculated field that does not allow override cannot be edited,
          // but a value stored before the card type changed has to be removable:
          // it is a validation error, and it would be inherited by every card
          // created from this template.
          const clearable =
            editable && f.isCalculated && !f.isOverridable && saved != null;
          const clear = () => {
            onChange(f.key, null);
            onSave(f.key, null);
          };
          return (
            <MetadataFieldRow
              key={f.key}
              id={metadataFieldRowId(f.key)}
              label={f.fieldDisplayName || f.key}
              dataType={f.dataType}
              description={f.fieldDescription}
              enumValues={f.enumValues}
              value={draft[f.key]}
              saved={saved}
              editable={rowEditable}
              overrideMode={f.isOverridable}
              clearable={clearable}
              onChange={(raw) =>
                onChange(f.key, coerceMetadataValue(raw, f.dataType))
              }
              onSave={() => onSave(f.key, draft[f.key])}
              onCancel={() => onCancel(f.key, saved)}
              onClear={clear}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
