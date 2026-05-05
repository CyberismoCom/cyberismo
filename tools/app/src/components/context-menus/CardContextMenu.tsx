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

import MoreIcon from '@mui/icons-material/MoreHoriz';
import {
  MenuButton,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Dropdown,
  Tooltip,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { getConfig, useModals } from '@/lib/utils';
import {
  MoveCardModal,
  DeleteModal,
  AddAttachmentModal,
  LogicProgramModal,
} from '@/components/modals';
import { useAppSelector } from '@/lib/hooks';
import { useCard, useProject } from '@/lib/api';
import { ExportCardModal } from '../modals/ExportCardModal';

interface CardContextMenuProps {
  cardKey: string;
  afterDelete?: () => void;
}

export function CardContextMenu({
  cardKey,
  afterDelete,
}: CardContextMenuProps) {
  const { modalOpen, openModal, closeModal } = useModals({
    delete: false,
    move: false,
    metadata: false,
    addAttachment: false,
    logicProgram: false,
    exportCard: false,
  });

  const { project } = useProject();
  const { t } = useTranslation();
  const { deleteCard } = useCard(cardKey);
  const recentlyCreated = useAppSelector((state) => state.card.recentlyCreated);

  const handleDeleteClick = async () => {
    if (recentlyCreated.includes(cardKey)) {
      const success = await deleteCard();
      if (success) {
        afterDelete?.();
      }
    } else {
      openModal('delete')();
    }
  };

  return (
    <>
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
          <MenuItem id="moveCardButton" onClick={openModal('move')}>
            <Typography>{t('move')}</Typography>
          </MenuItem>
          <MenuItem
            data-cy="addAttachmentButton"
            onClick={openModal('addAttachment')}
          >
            <Typography>{t('addAttachment')}</Typography>
          </MenuItem>
          <Divider />
          <MenuItem onClick={openModal('logicProgram')}>
            <Typography>{t('viewLogicProgram')}</Typography>
          </MenuItem>
          {!getConfig().staticMode && (
            <>
              <Divider />
              <MenuItem onClick={openModal('exportCard')}>
                <Typography>{t('exportCard')}</Typography>
              </MenuItem>
            </>
          )}
          <Divider />
          <MenuItem data-cy="deleteCardButton" onClick={handleDeleteClick}>
            <Typography color="danger">{t('deleteCard')}</Typography>
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
        afterDelete={afterDelete}
      />
      <AddAttachmentModal
        open={modalOpen.addAttachment}
        onClose={closeModal('addAttachment')}
        cardKey={cardKey}
      />
      <LogicProgramModal
        open={modalOpen.logicProgram}
        onClose={closeModal('logicProgram')}
        title={t('logicProgram')}
        resourceName={`${project?.prefix}/cards/${cardKey}`}
      />
      <ExportCardModal
        open={modalOpen.exportCard}
        onClose={closeModal('exportCard')}
        cardKey={cardKey}
      />
    </>
  );
}
