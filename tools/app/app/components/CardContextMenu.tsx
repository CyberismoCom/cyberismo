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
import { MoveCardModal, DeleteModal, MetadataModal } from './modals';

interface CardContextMenuProps {
  cardKey: string;
}

const CardContextMenu: React.FC<CardContextMenuProps> = ({ cardKey }) => {
  const { modalOpen, openModal, closeModal } = useModals({
    delete: false,
    move: false,
    metadata: false,
  });

  const { t } = useTranslation();

  return (
    <>
      <Dropdown>
        <MenuButton size="sm">
          <MoreIcon />
        </MenuButton>
        <Menu>
          <MenuItem onClick={openModal('metadata')}>{t('metadata')}</MenuItem>
          <Divider />
          <MenuItem onClick={openModal('delete')}>
            <Typography color="danger">{t('deleteCard')}</Typography>
          </MenuItem>
          <MenuItem onClick={openModal('move')}>
            <Typography>{t('move')}</Typography>
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
    </>
  );
};

export default CardContextMenu;
