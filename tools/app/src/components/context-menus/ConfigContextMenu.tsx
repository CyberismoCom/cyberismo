// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import MoreIcon from '@mui/icons-material/MoreVert';
import type { AnyNode } from '@/lib/api/types';
import { useModals } from '@/lib/utils';
import { ResourceDeleteModal } from '../modals';
import { LogicProgramModal } from '../modals/LogicProgramModal';

export interface ConfigContextMenuProps {
  node: AnyNode;
  enabled?: {
    delete?: boolean;
    logicProgram?: boolean;
  };
}

export function ConfigContextMenu({ node, enabled }: ConfigContextMenuProps) {
  const { t } = useTranslation();
  const { modalOpen, openModal, closeModal } = useModals({
    delete: false,
    logicProgram: false,
  });

  return (
    <>
      {enabled && Object.values(enabled).some((value) => value === true) && (
        <Dropdown>
          <Tooltip title={t('moreTooltip')} placement="top">
            <MenuButton
              data-cy="contextMenuButton"
              size="sm"
              variant="plain"
              style={{ width: 40 }}
            >
              <MoreIcon />
            </MenuButton>
          </Tooltip>
          <Menu>
            {enabled?.delete && (
              <MenuItem
                data-cy="deleteResourceButton"
                onClick={openModal('delete')}
              >
                <Typography color="danger">{t('deleteResource')}</Typography>
              </MenuItem>
            )}
            {enabled?.logicProgram && (
              <MenuItem onClick={openModal('logicProgram')}>
                <Typography>{t('viewLogicProgram')}</Typography>
              </MenuItem>
            )}
          </Menu>
        </Dropdown>
      )}
      {enabled?.logicProgram && (
        <LogicProgramModal
          open={modalOpen.logicProgram}
          onClose={closeModal('logicProgram')}
          title={t('logicProgram')}
          resourceName={node.name}
        />
      )}
      {enabled?.delete && (
        <ResourceDeleteModal
          open={modalOpen.delete}
          onClose={closeModal('delete')}
          resourceName={node.name}
          resourceType={node.type}
        />
      )}
    </>
  );
}
