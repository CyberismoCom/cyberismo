/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import * as React from 'react';
import MoreIcon from '@mui/icons-material/MoreHoriz';

import { CardMetadata } from '../lib/definitions';
import {
  Button,
  Modal,
  DialogActions,
  DialogContent,
  ModalDialog,
  DialogTitle,
  Table,
  MenuButton,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Dropdown,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useModals } from '../lib/utils';
import { useCard } from '../lib/api';
import {
  MoveCardModal,
  DeleteModal,
  MetadataModal,
  AddAttachmentModal,
} from './modals';

interface CardContextMenuProps {
  cardKey: string;
}

const CardContextMenu: React.FC<CardContextMenuProps> = ({ cardKey }) => {
  const { modalOpen, openModal, closeModal } = useModals({
    delete: false,
    move: false,
    metadata: false,
    addAttachment: false,
  });

  const { t } = useTranslation();

  return (
    <>
      <Dropdown>
        <MenuButton data-cy="contextMenuButton" size="sm">
          <MoreIcon />
        </MenuButton>
        <Menu>
          <MenuItem onClick={openModal('metadata')}>{t('metadata')}</MenuItem>
          <Divider />
          <MenuItem data-cy="deleteCardButton" onClick={openModal('delete')}>
            <Typography color="danger">{t('deleteCard')}</Typography>
          </MenuItem>
          <MenuItem id="moveCardButton" onClick={openModal('move')}>
            <Typography>{t('move')}</Typography>
          </MenuItem>
          <MenuItem
            data-cy="addAttachmentButton"
            onClick={openModal('addAttachment')}
          >
            <Typography>{t('addAttachment')}</Typography>
          </MenuItem>
        </Menu>
      </Dropdown>

      <MoveCardModal
        open={modalOpen.move}
        onClose={closeModal('move')}
        cardKey={cardKey}
      />
      <DeleteModal
        open={modalOpen.delete}
        onClose={closeModal('delete')}
        cardKey={cardKey}
      />
      <MetadataModal
        open={modalOpen.metadata}
        onClose={closeModal('metadata')}
        cardKey={cardKey}
      />
      <AddAttachmentModal
        open={modalOpen.addAttachment}
        onClose={closeModal('addAttachment')}
        cardKey={cardKey}
      />
    </>
  );
};

export default CardContextMenu;
