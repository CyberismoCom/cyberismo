// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { IconButton } from '@mui/joy';
import { useThemeCycle } from '@/lib/hooks';

/**
 * Toggle button for cycling between system, light, and dark color schemes.
 */
export function ThemeModeToggle() {
  const { cycle, icon, switchLabel } = useThemeCycle();

  return (
    <IconButton
      variant="plain"
      color="neutral"
      onClick={cycle}
      aria-label={switchLabel}
      sx={{
        '--IconButton-size': '32px',
        marginRight: '6px',
        color: 'common.white',
      }}
    >
      {icon}
    </IconButton>
  );
}
