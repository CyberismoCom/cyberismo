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
import { ChangeSetMenuItems } from './changesets/ChangeSetMenuItems';
import { StartChangeSetModal } from './changesets/StartChangeSetModal';

export const CardTreeMenu = () => {
  const { t } = useTranslation();
  const router = useAppRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [startOpen, setStartOpen] = React.useState(false);
  const canEdit = useHasMinRole(UserRole.Editor);
  const { staticMode } = getConfig();
  return (
    <>
      <Dropdown>
        <MenuButton
          variant="plain"
          size="sm"
          endDecorator={<MoreHoriz />}
          aria-label={t('projectMenu')}
          data-cy="projectMenu"
        />
        <Menu
          placement="bottom-end"
          sx={{ zIndex: 'calc(var(--joy-zIndex-modal) + 1)' }}
        >
          {!staticMode && (
            <MenuItem onClick={() => setIsOpen(true)}>
              {t('exportProject')}
            </MenuItem>
          )}
          <MenuItem onClick={() => router.push('/configuration')}>
            {t('configuration')}
          </MenuItem>
          {canEdit && !staticMode && (
            <ChangeSetMenuItems onStart={() => setStartOpen(true)} />
          )}
        </Menu>
      </Dropdown>
      <ExportProjectModal open={isOpen} onClose={() => setIsOpen(false)} />
      <StartChangeSetModal
        open={startOpen}
        onClose={() => setStartOpen(false)}
      />
    </>
  );
};
