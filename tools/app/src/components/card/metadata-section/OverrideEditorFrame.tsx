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

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Stack, Typography } from '@mui/joy';

/** Removes a stored value, restoring the calculated value of the field. */
export function ClearOverrideButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      data-cy="fieldClearOverrideButton"
      size="sm"
      variant="plain"
      color="neutral"
      disabled={disabled}
      onClick={onClick}
    >
      {t('clearOverride')}
    </Button>
  );
}

/**
 * The editing layout of an overridable calculated field: the automatic value on
 * its own line, above the override editor and a Clear button. Shared by the card
 * metadata row and the template card row so that the two cannot drift apart.
 *
 * `automaticValue` is pre-formatted text rather than a value, because a template
 * card has no calculated value to show and describes the automatic value instead.
 */
export function OverrideEditorFrame({
  automaticValue,
  editor,
  clearDisabled,
  onClear,
  actions,
}: {
  automaticValue: string;
  editor: ReactNode;
  clearDisabled?: boolean;
  onClear: () => void;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Stack
      spacing={0.5}
      sx={{
        flexGrow: 1,
        width: { xs: '100%', md: 'auto' },
        minWidth: 0,
      }}
    >
      {/* Overridable fields are always of a "normal" dataType, never 'label'. */}
      <Typography level="body-xs" data-cy="automaticValue">
        {t('automaticValue')}:{' '}
        <Typography component="span" fontWeight="bold" color="neutral">
          {automaticValue}
        </Typography>
      </Typography>
      <Stack direction="row" alignItems="flex-start" spacing={0.5}>
        <Typography level="body-xs" sx={{ flexShrink: 0, alignSelf: 'center' }}>
          {t('override')}:
        </Typography>
        <Box flexGrow={1} minWidth={0}>
          {editor}
        </Box>
        <ClearOverrideButton disabled={clearDisabled} onClick={onClear} />
        {actions}
      </Stack>
    </Stack>
  );
}
