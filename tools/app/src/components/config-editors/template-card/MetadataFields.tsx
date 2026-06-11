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
            editable && !f.isCalculated && !deniedFields.includes(f.key);
          const saved = getDefaultValue(f.value);
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
              onChange={(raw) =>
                onChange(f.key, coerceMetadataValue(raw, f.dataType))
              }
              onSave={() => onSave(f.key, draft[f.key])}
              onCancel={() => onCancel(f.key, saved)}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
