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
import { useProject } from '@/lib/api/project';

interface ModalProps {
  open: boolean;
  heading: string;
  onClose: () => void;
  cardKey: string;
  defaultFileName: string;
  defaultTitle?: string;
  forceChildExport?: boolean;
}

type ExportModalProps = Omit<
  ModalProps,
  'heading' | 'defaultFileName' | 'forceChildExport'
>;

const ExportModal = ({
  open,
  onClose,
  cardKey,
  defaultFileName,
  defaultTitle = '',
  forceChildExport = false,
  heading,
}: ModalProps) => {
  const { t } = useTranslation();
  const [exportChildCards, setExportChildCards] =
    React.useState(forceChildExport);
  const { card, exportCard } = useCard(cardKey);
  const [title, setTitle] = React.useState(defaultTitle);
  const [name, setName] = React.useState(defaultFileName);
  React.useEffect(() => {
    if (card) {
      setTitle(card.title);
    }
  }, [card]);
  const handleClose = () => {
    setExportChildCards(forceChildExport);
    setTitle(card?.title ?? defaultTitle);
    setName(defaultFileName);
    onClose();
  };
  return (
    <Modal open={open} onClose={handleClose} disableEscapeKeyDown>
      <ModalDialog size="md" sx={{ minWidth: 480 }}>
        <DialogTitle>{heading}</DialogTitle>
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
          <Typography level="body-sm">
            {t('exportCardTitleDescription')}
          </Typography>

          <label htmlFor="name">
            <Typography>{t('name')}</Typography>
          </label>
          <Input
            fullWidth
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Typography level="body-sm">
            {t('exportCardNameDescription')}
          </Typography>

          <Checkbox
            checked={exportChildCards}
            onChange={(e) => setExportChildCards(e.target.checked)}
            label={t('exportChildCards')}
            disabled={forceChildExport}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              exportCard({
                cardKey,
                title,
                name,
                exportChildCards,
              });
              handleClose();
            }}
          >
            {t('export')}
          </Button>
          <Button onClick={handleClose}>{t('close')}</Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
};

export const ExportCardModal = (
  props: Omit<
    ExportModalProps,
    'title' | 'forceChildExport' | 'defaultFileName'
  >,
) => {
  const { t } = useTranslation();
  return (
    <ExportModal
      {...props}
      heading={t('exportCard')}
      defaultFileName="card-export"
    />
  );
};

export const ExportProjectModal = (
  props: Omit<ExportModalProps, 'cardKey'>,
) => {
  const { t } = useTranslation();
  const { project } = useProject();
  const defaultTitle = project ? project.name : 'project-export';
  return (
    <ExportModal
      {...props}
      cardKey=""
      heading={t('exportProject')}
      defaultTitle={defaultTitle}
      defaultFileName="project-export"
      forceChildExport
    />
  );
};
