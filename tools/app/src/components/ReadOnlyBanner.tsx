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

import { Sheet, Stack, Typography } from '@mui/joy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useTranslation } from 'react-i18next';

import { useProjectReadOnlyMode } from '@/lib/api';

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

  if (!readOnlyMode) return null;

  return (
    <Sheet
      data-cy="readOnlyBanner"
      role="status"
      color="warning"
      variant="soft"
      sx={{
        height: READ_ONLY_BANNER_HEIGHT,
        px: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack
        height="100%"
        direction="row"
        alignItems="center"
        justifyContent="center"
        gap={1}
      >
        <VisibilityIcon fontSize="small" />
        <Typography level="body-sm" textColor="inherit">
          {t('readOnlyMode.banner')}
        </Typography>
      </Stack>
    </Sheet>
  );
}

export default ReadOnlyBanner;
