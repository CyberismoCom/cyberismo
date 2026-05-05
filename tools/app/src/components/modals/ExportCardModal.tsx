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

import { useState } from 'react';
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useCard, useCardExport } from '@/lib/api/card';
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
  const { card } = useCard(cardKey);
  const { exportCard } = useCardExport();
  const [exportChildCards, setExportChildCards] = useState(forceChildExport);
  const [title, setTitle] = useState(card?.title ?? defaultTitle);
  const [name, setName] = useState(defaultFileName);
  const [version, setVersion] = useState('');

  const handleClose = () => {
    setExportChildCards(forceChildExport);
    setTitle(card?.title ?? defaultTitle);
    setName(defaultFileName);
    setVersion('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} disableEscapeKeyDown>
      <ModalDialog size="md" sx={{ minWidth: 480 }}>
        <DialogTitle>{heading}</DialogTitle>
        <DialogContent sx={{ overflow: 'hidden' }}>
          <FormControl>
            <FormLabel>{t('title')}</FormLabel>
            <Input
              fullWidth
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <FormHelperText>{t('exportCardTitleDescription')}</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>{t('name')}</FormLabel>
            <Input
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <FormHelperText>{t('exportCardNameDescription')}</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>{t('version')}</FormLabel>
            <Input
              fullWidth
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
            <FormHelperText>{t('exportCardVersionDescription')}</FormHelperText>
          </FormControl>

          {!forceChildExport && (
            <Checkbox
              checked={exportChildCards}
              onChange={(e) => setExportChildCards(e.target.checked)}
              label={t('exportChildCards')}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              exportCard({
                cardKey,
                title,
                name,
                exportChildCards,
                ...(version && { version }),
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
