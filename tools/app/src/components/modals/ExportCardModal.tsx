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
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  Typography,
  Input,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useCard } from '@/lib/api/card';

interface ExportCardModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
}

export const ExportCardModal = ({
  open,
  onClose,
  cardKey,
}: ExportCardModalProps) => {
  const { t } = useTranslation();
  const [exportChildCards, setExportChildCards] = React.useState(false);
  const { card } = useCard(cardKey);
  const [title, setTitle] = React.useState('');
  React.useEffect(() => {
    if (card) {
      setTitle(card.title);
    }
  }, [card]);
  const handleClose = () => {
    setExportChildCards(false);
    setTitle(card?.title ?? '');
    onClose();
  };
  return (
    <Modal open={open} onClose={handleClose} disableEscapeKeyDown>
      <ModalDialog size="md" sx={{ minWidth: 480 }}>
        <DialogTitle>{t('exportCard')}</DialogTitle>
        <DialogContent sx={{ overflow: 'hidden' }}>
          <label htmlFor="title">
            <Typography>{t('title')}</Typography>
          </label>
          <Input
            fullWidth
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Checkbox
            checked={exportChildCards}
            onChange={(e) => setExportChildCards(e.target.checked)}
            label={t('exportChildCards')}
          />
        </DialogContent>
        <DialogActions>
          <Button>{t('export')}</Button>
          <Button onClick={handleClose}>{t('close')}</Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
};
