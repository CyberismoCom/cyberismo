// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { useAppRouter } from '@/lib/hooks';
import { getConfig } from '@/lib/utils';
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
        <Menu
          placement="bottom-end"
          sx={{ zIndex: 'calc(var(--joy-zIndex-modal) + 1)' }}
        >
          {!getConfig().staticMode && (
            <MenuItem onClick={() => setIsOpen(true)}>
              {t('exportProject')}
            </MenuItem>
          )}
          <MenuItem onClick={() => router.push('/configuration')}>
            {t('configuration')}
          </MenuItem>
        </Menu>
      </Dropdown>
      <ExportProjectModal open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
