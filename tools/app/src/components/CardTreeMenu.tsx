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

import React from 'react';
import { useAppRouter } from '@/lib/hooks';
import { getConfig } from '@/lib/utils';
import { MoreHoriz } from '@mui/icons-material';
import { Dropdown, MenuButton, Menu, MenuItem } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { ExportProjectModal } from './modals/ExportCardModal';
import { UserRole, useHasMinRole } from '@/lib/auth';

export const CardTreeMenu = () => {
  const { t } = useTranslation();
  const router = useAppRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  // Configuration edits project resources, so it takes the same role that
  // gates creating them.
  const isAdmin = useHasMinRole(UserRole.Admin);
  const canExport = !getConfig().staticMode;

  // A static export is always served as a reader, so both entries would be
  // hidden there. Render nothing rather than an empty dropdown.
  if (!canExport && !isAdmin) return null;
  return (
    <>
      <Dropdown>
        <MenuButton variant="plain" size="sm" endDecorator={<MoreHoriz />} />
        <Menu
          placement="bottom-end"
          sx={{ zIndex: 'calc(var(--joy-zIndex-modal) + 1)' }}
        >
          {canExport && (
            <MenuItem onClick={() => setIsOpen(true)}>
              {t('exportProject')}
            </MenuItem>
          )}
          {isAdmin && (
            <MenuItem
              data-cy="configurationMenuItem"
              onClick={() => router.push('/configuration')}
            >
              {t('configuration')}
            </MenuItem>
          )}
        </Menu>
      </Dropdown>
      <ExportProjectModal open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
