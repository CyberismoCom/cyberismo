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
import { useTranslation } from 'react-i18next';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';

/**
 * Shared theme-cycle state. Cycles: system → light → dark → system.
 * `switchLabel` is the translated label describing the next mode in the cycle.
 */
export function useThemeCycle() {
  const { mode, setMode } = useColorScheme();
  const { t } = useTranslation();

  const cycle = () => {
    if (mode === 'system') setMode('light');
    else if (mode === 'light') setMode('dark');
    else setMode('system');
  };

  const icon =
    mode === 'light' ? (
      <LightModeIcon />
    ) : mode === 'dark' ? (
      <DarkModeIcon />
    ) : (
      <SettingsBrightnessIcon />
    );

  const switchLabel =
    mode === 'system'
      ? t('toolbar.switchToLight')
      : mode === 'light'
        ? t('toolbar.switchToDark')
        : t('toolbar.switchToSystem');

  return { cycle, icon, switchLabel };
}
