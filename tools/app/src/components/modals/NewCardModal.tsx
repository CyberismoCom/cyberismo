/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useState } from 'react';
import {
  Box,
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  ModalClose,
  Input,
  IconButton,
} from '@mui/joy';
import ClearIcon from '@mui/icons-material/Clear';
import { useTranslation } from 'react-i18next';
import { useCard, useTemplates } from '@/lib/api';
import { useAppDispatch } from '@/lib/hooks';
import { useAppRouter } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import type { TemplateConfiguration } from '@cyberismo/data-handler/interfaces/project-interfaces';
import RadioGroup from '@mui/joy/RadioGroup';
import { CategoryOption } from './OptionCards';

interface NewCardModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string | null;
}

export function NewCardModal({ open, onClose, cardKey }: NewCardModalProps) {
  const { t } = useTranslation();
  const [chosenTemplate, setChosenTemplate] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [createAtRoot, setCreateAtRoot] = useState(false);

  const router = useAppRouter();

  const { templates } = useTemplates();

  const { createCard, card, isUpdating } = useCard(cardKey);

  const dispatch = useAppDispatch();

  // divide templates into categories
  const categories = (templates || []).reduce<
    Record<string, TemplateConfiguration[]>
  >((acc, template) => {
    const category = template.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    if (
      !filter ||
      template.displayName?.toLowerCase().includes(filter.toLowerCase()) ||
      category.toLowerCase().includes(filter.toLowerCase())
    ) {
      acc[category].push(template);
    }
    return acc;
  }, {});

  const noTemplatesInCategories = (
    categories: Record<string, TemplateConfiguration[]>,
  ) => {
    return Object.values(categories).every((arr) => arr.length === 0);
  };

  const handleFilterChange = (value: string) => {
    setFilter(value);
    if (chosenTemplate) {
      setChosenTemplate(null);
    }
  };

  const handleClose = () => {
    setFilter('');
    setChosenTemplate(null);
    setCreateAtRoot(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog
        sx={{
          height: '90%',
          width: '60%',
        }}
      >
        <ModalClose />
        <DialogTitle>{t('newCardDialog.title')}</DialogTitle>
        <Input
          type="text"
          autoFocus
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
          placeholder={t('newCardDialog.searchTemplates')}
          endDecorator={
            filter && (
              <IconButton
                variant="plain"
                size="sm"
                onClick={() => handleFilterChange('')}
                aria-label="Clear"
              >
                <ClearIcon />
              </IconButton>
            )
          }
        />
        <DialogContent
          sx={{
            padding: 2,
          }}
        >
          <Box
            sx={{
              overflowY: 'scroll',
              overflowX: 'hidden',
            }}
          >
            {noTemplatesInCategories(categories) ? (
              <Typography level="body-xs" color="neutral">
                {t('newCardDialog.noTemplatesFoundMessage')}
              </Typography>
            ) : (
              Object.entries(categories).map(
                ([category, templates]) =>
                  templates.length > 0 && (
                    <CategoryOption
                      key={category}
                      category={category}
                      options={templates.map((template) => ({
                        name: template.name,
                        displayName: template.displayName,
                        description: template.description ?? '',
                        isChosen: chosenTemplate === template.name,
                      }))}
                      onOptionSelect={setChosenTemplate}
                    />
                  ),
              )
            )}
          </Box>
          <DialogActions
            sx={{
              marginTop: 'auto',
            }}
          >
            <Button
              data-cy="confirmCreateButton"
              disabled={chosenTemplate === null}
              loading={isUpdating('create')}
              onClick={async () => {
                if (chosenTemplate) {
                  try {
                    const cards = await createCard(
                      chosenTemplate,
                      createAtRoot ? 'root' : undefined,
                    );
                    dispatch(
                      addNotification({
                        message: t('createCard.success'),
                        type: 'success',
                      }),
                    );

                    if (cards && cards.length > 0) {
                      router.push(`/cards/${cards[0].key}`);
                    }
                    handleClose();
                  } catch (error) {
                    dispatch(
                      addNotification({
                        message: error instanceof Error ? error.message : '',
                        type: 'error',
                      }),
                    );
                  }
                }
              }}
              color="primary"
            >
              {t('create')}
            </Button>
            <Button
              onClick={handleClose}
              variant="plain"
              color="neutral"
              disabled={isUpdating()}
            >
              {t('cancel')}
            </Button>
            {cardKey && (
              <>
                <Box flexGrow={1} />
                <RadioGroup
                  value={createAtRoot ? 'root' : 'under'}
                  onChange={(e) => setCreateAtRoot(e.target.value === 'root')}
                >
                  <Radio
                    value="under"
                    label={t('createUnder', {
                      parent: card?.title || cardKey,
                    })}
                  />
                  <Radio value="root" label={t('createOnTopLevel')} />
                </RadioGroup>
              </>
            )}
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default NewCardModal;
