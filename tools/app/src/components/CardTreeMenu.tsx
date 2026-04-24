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
import { MoreHoriz } from '@mui/icons-material';
import { Dropdown, MenuButton, Menu, MenuItem } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { ExportProjectModal } from './modals/ExportCardModal';

export const CardTreeMenu = () => {
  const { t } = useTranslation();
  const router = useAppRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <>
      <Dropdown>
        <MenuButton variant="plain" size="sm" endDecorator={<MoreHoriz />} />
        <Menu placement="bottom-end">
          <MenuItem onClick={() => setIsOpen(true)}>
            {t('exportProject')}
          </MenuItem>
          <MenuItem onClick={() => router.safePush('/configuration')}>
            {t('configuration')}
          </MenuItem>
        </Menu>
      </Dropdown>
      <ExportProjectModal open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
