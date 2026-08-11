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

import { Typography } from '@mui/joy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useTranslation } from 'react-i18next';

import { useProjectReadOnlyMode } from '@/lib/api';
import { UserRole, useHasMinRole } from '@/lib/auth';

/** Height reserved for the banner, so the main area can subtract it. */
export const READ_ONLY_BANNER_HEIGHT = 32;

/**
 * Site-wide notice shown on every page while the project is in read-only mode.
 *
 * Admins keep their permissions in this mode, so without a banner they would
 * have no indication it is on; everyone else needs to know why editing has
 * disappeared rather than assuming something is broken.
 */
export function ReadOnlyBanner() {
  const { t } = useTranslation();
  const readOnlyMode = useProjectReadOnlyMode();
  const isAdmin = useHasMinRole(UserRole.Admin);

  if (!readOnlyMode) return null;

  return (
    <Typography
      data-cy="readOnlyBanner"
      role="status"
      level="body-sm"
      startDecorator={<VisibilityIcon fontSize="small" />}
      sx={{
        height: READ_ONLY_BANNER_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        paddingX: 2,
        textAlign: 'center',
        color: 'warning.softColor',
        backgroundColor: 'warning.softBg',
        borderBottom: '1px solid',
        borderColor: 'warning.outlinedBorder',
      }}
    >
      {isAdmin ? t('readOnlyMode.bannerAdmin') : t('readOnlyMode.banner')}
    </Typography>
  );
}

export default ReadOnlyBanner;
