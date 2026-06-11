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

import { Box, IconButton, Stack } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditableField from '@/components/EditableField';
import type { DataType, MetadataValue } from '@/lib/definitions';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import { metadataValuesEqual } from '@/lib/utils';
import { formKeyHandler } from '@/lib/hooks';

/**
 * A single edit-first metadata row, controlled by the parent working draft
 * (`value`) and dirty-checked against the saved value (`saved`). Reuses the
 * shared `EditableField` for the label + editor; Save and Cancel are both
 * disabled until the field actually changes.
 */
export function MetadataFieldRow({
  id,
  label,
  dataType,
  description,
  enumValues,
  value,
  saved,
  editable,
  onChange,
  onSave,
  onCancel,
}: {
  id?: string;
  label: string;
  dataType: DataType | 'label';
  description?: string;
  enumValues?: EnumDefinition[];
  value: MetadataValue;
  saved: MetadataValue;
  editable: boolean;
  onChange: (raw: string | string[] | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const dirty = !metadataValuesEqual(value, saved);
  return (
    <Box
      id={id}
      sx={{
        borderLeft: '3px solid',
        borderColor: dirty ? 'primary.300' : 'neutral.300',
        paddingX: 0.5,
        paddingY: 0.5,
        marginY: 0.5,
      }}
      onKeyDown={formKeyHandler({
        canSubmit: editable && dirty,
        onSubmit: onSave,
        onCancel,
        multiline: dataType === 'longText' || dataType === 'label',
      })}
    >
      <Stack direction="row" alignItems="flex-start" spacing={0.5}>
        <Box flexGrow={1} minWidth={0}>
          <EditableField
            label={label}
            dataType={dataType}
            description={description}
            enumValues={enumValues}
            value={value}
            edit={editable}
            disabled={!editable}
            focus={false}
            onChange={onChange}
          />
        </Box>
        {editable && (
          <Stack direction="row" spacing={0.5}>
            <IconButton
              data-cy="fieldSaveButton"
              size="sm"
              variant="soft"
              color="primary"
              disabled={!dirty}
              onClick={onSave}
            >
              <CheckIcon />
            </IconButton>
            <IconButton
              data-cy="fieldCancelButton"
              size="sm"
              variant="soft"
              color="neutral"
              disabled={!dirty}
              onClick={onCancel}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
