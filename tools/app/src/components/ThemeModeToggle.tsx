/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { IconButton } from '@mui/joy';
import { useColorScheme } from '@mui/joy/styles';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

/**
 * Toggle button for switching between light and dark color schemes.
 * Automatically syncs with system preferences when defaultMode="system".
 */
export function ThemeModeToggle() {
  const { mode, setMode, systemMode } = useColorScheme();

  // When mode is "system", use the actual system mode for display and toggle logic
  const currentMode = mode === 'system' ? systemMode : mode;

  const handleToggle = () => {
    setMode(currentMode === 'light' ? 'dark' : 'light');
  };

  return (
    <IconButton
      variant="plain"
      color="neutral"
      onClick={handleToggle}
      aria-label={`Switch to ${currentMode === 'light' ? 'dark' : 'light'} mode`}
      sx={{
        '--IconButton-size': '32px',
        marginRight: '6px',
      }}
    >
      {currentMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
    </IconButton>
  );
}
