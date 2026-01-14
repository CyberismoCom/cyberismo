/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
