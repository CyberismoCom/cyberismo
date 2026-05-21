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
