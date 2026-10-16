// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useColorScheme } from '@mui/joy/styles';

/**
 * Hook to determine if the app is currently in dark mode.
 * Handles 'system' mode by checking the actual system preference.
 *
 * @returns true if dark mode is active, false otherwise
 */
export function useIsDarkMode(): boolean {
  const { mode, systemMode } = useColorScheme();

  if (mode === 'dark') {
    return true;
  }

  if (mode === 'light') {
    return false;
  }

  return systemMode === 'dark';
}
