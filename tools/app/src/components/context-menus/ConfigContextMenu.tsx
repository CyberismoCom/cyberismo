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
import { ResourceNode } from '@/lib/api/types';
import { useModals } from '@/lib/utils';
import { ResourceDeleteModal } from '../modals';
import { LogicProgramModal } from '../modals/LogicProgramModal';

export interface ConfigContextMenuProps {
  node: ResourceNode;
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
      <LogicProgramModal
        open={modalOpen.logicProgram}
        onClose={closeModal('logicProgram')}
        title={t('logicProgram')}
        resourceName={node.name}
      />
      <ResourceDeleteModal
        open={modalOpen.delete}
        onClose={closeModal('delete')}
        resourceName={node.name}
        resourceType={node.type}
      />
    </>
  );
}
