// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
