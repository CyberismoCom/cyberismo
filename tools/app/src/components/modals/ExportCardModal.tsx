// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from 'react';
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
  Option,
  Select,
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

const TOC_LEVELS = [1, 2, 3, 4, 5];
const DEFAULT_TOC_LEVELS = 5;

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
  const [showMetadata, setShowMetadata] = useState(true);
  const [tocLevels, setTocLevels] = useState(DEFAULT_TOC_LEVELS);
  const [title, setTitle] = useState(card?.title ?? defaultTitle);
  const [name, setName] = useState(defaultFileName);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (card) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(card.title);
    }
  }, [card]);

  const handleClose = () => {
    setExportChildCards(forceChildExport);
    setShowMetadata(true);
    setTocLevels(DEFAULT_TOC_LEVELS);
    setTitle(card?.title ?? defaultTitle);
    setName(defaultFileName);
    setVersion('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} disableEscapeKeyDown>
      <ModalDialog
        size="md"
        sx={{
          width: { xs: '95vw', sm: 'auto' },
          minWidth: { sm: 480 },
        }}
      >
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

          <FormControl>
            <FormLabel>{t('exportTocLevels')}</FormLabel>
            <Select
              value={tocLevels}
              onChange={(_, value) => value !== null && setTocLevels(value)}
            >
              {TOC_LEVELS.map((level) => (
                <Option key={level} value={level}>
                  {level}
                </Option>
              ))}
            </Select>
            <FormHelperText>{t('exportTocLevelsDescription')}</FormHelperText>
          </FormControl>

          {!forceChildExport && (
            <Checkbox
              checked={exportChildCards}
              onChange={(e) => setExportChildCards(e.target.checked)}
              label={t('exportChildCards')}
            />
          )}
          <Checkbox
            checked={showMetadata}
            onChange={(e) => setShowMetadata(e.target.checked)}
            label={t('exportShowMetadata')}
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
                showMetadata,
                tocLevels,
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
