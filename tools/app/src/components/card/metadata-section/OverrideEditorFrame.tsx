// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Stack, Tooltip, Typography } from '@mui/joy';

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
      onMouseDown={(e) => e.preventDefault()}
    >
      {t('clearOverride')}
    </Button>
  );
}

/**
 * Marks a field whose calculated value is currently replaced by a stored
 * override.
 *
 * `calculatedValue` is pre-formatted text rather than a value, and optional,
 * because a template card has no calculated value to name.
 */
export function OverriddenMarker({
  calculatedValue,
}: {
  calculatedValue?: string;
}) {
  const { t } = useTranslation();
  const label = calculatedValue
    ? t('overriddenWithCalculatedValue', { value: calculatedValue })
    : t('overridden');
  return (
    <Tooltip
      title={label}
      placement="top"
      color="primary"
      variant="outlined"
      disableInteractive
    >
      {/* role="img" so the label is exposed; aria-label alone on a span is not. */}
      <Typography
        component="span"
        data-cy="overriddenMarker"
        role="img"
        aria-label={label}
        sx={{ ml: 0.25, color: 'neutral.500', userSelect: 'none' }}
      >
        *
      </Typography>
    </Tooltip>
  );
}

/**
 * The editing layout of an overridable calculated field: the calculated value on
 * its own line, above the override editor and a Clear button. Shared by the card
 * metadata row and the template card row so that the two cannot drift apart.
 *
 * `calculatedValue` is pre-formatted text rather than a value, because a template
 * card has no calculated value to show and describes it instead.
 */
export function OverrideEditorFrame({
  calculatedValue,
  editor,
  clearDisabled,
  onClear,
  actions,
}: {
  calculatedValue: string;
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
      <Typography level="body-xs" data-cy="calculatedValue">
        {t('calculatedValue')}:{' '}
        <Typography component="span" fontWeight="bold" color="neutral">
          {calculatedValue}
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
