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

import { Box, IconButton, Stack, Textarea } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { TITLE_FIELD_PROPS } from '@/lib/constants';

export function TitleEditor({
  value,
  dirty,
  editable,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  dirty: boolean;
  editable: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      id="card-title-editor"
      border="1px solid"
      borderColor={dirty ? 'primary.outlinedBorder' : 'neutral.outlinedBorder'}
      borderRadius={6}
      padding={{ xs: 1, sm: 1.5 }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={0.5}>
        <Box flexGrow={1} minWidth={0}>
          <Textarea
            {...TITLE_FIELD_PROPS}
            variant="plain"
            value={value}
            minRows={1}
            maxRows={3}
            readOnly={!editable}
            placeholder={t('title')}
            slotProps={{ textarea: { 'data-cy': 'cardTitleInput' } }}
            onChange={(e) => onChange(e.target.value)}
          />
        </Box>
        {editable && (
          <Stack direction="row" spacing={0.5}>
            <IconButton
              data-cy="titleSaveButton"
              size="sm"
              variant="soft"
              color="primary"
              disabled={!dirty}
              onClick={onSave}
            >
              <CheckIcon />
            </IconButton>
            <IconButton
              data-cy="titleCancelButton"
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
