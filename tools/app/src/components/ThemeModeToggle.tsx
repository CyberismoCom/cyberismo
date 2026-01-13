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
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';

/**
 * Toggle button for cycling between system, light, and dark color schemes.
 * Cycles: system → light → dark → system
 */
export function ThemeModeToggle() {
  const { mode, setMode } = useColorScheme();

  const handleToggle = () => {
    // Cycle: system → light → dark → system
    if (mode === 'system') {
      setMode('light');
    } else if (mode === 'light') {
      setMode('dark');
    } else {
      setMode('system');
    }
  };

  const getIcon = () => {
    switch (mode) {
      case 'light':
        return <LightModeIcon />;
      case 'dark':
        return <DarkModeIcon />;
      default:
        return <SettingsBrightnessIcon />;
    }
  };

  const getNextModeLabel = () => {
    switch (mode) {
      case 'system':
        return 'light';
      case 'light':
        return 'dark';
      default:
        return 'system';
    }
  };

  return (
    <IconButton
      variant="plain"
      color="neutral"
      onClick={handleToggle}
      aria-label={`Switch to ${getNextModeLabel()} mode`}
      sx={{
        '--IconButton-size': '32px',
        marginRight: '6px',
        color: 'common.white',
      }}
    >
      {getIcon()}
    </IconButton>
  );
}
