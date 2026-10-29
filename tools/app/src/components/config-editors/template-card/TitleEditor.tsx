// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Box, IconButton, Stack, Textarea } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { TITLE_FIELD_PROPS } from '@/lib/constants';
import { formKeyHandler } from '@/lib/hooks';

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
      onKeyDown={formKeyHandler({
        canSubmit: editable && dirty,
        onSubmit: onSave,
        onCancel,
      })}
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
