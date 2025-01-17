/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useEffect } from 'react';
import {
  Box,
  Modal,
  ModalDialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  Stack,
  Radio,
  ModalClose,
  CardOverflow,
  Grid,
  Input,
  IconButton,
} from '@mui/joy';
import ClearIcon from '@mui/icons-material/Clear';
import { useTranslation } from 'react-i18next';
import { useCard, useTemplates } from '@/app/lib/api';
import { useAppDispatch } from '@/app/lib/hooks';
import { useAppRouter } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import { TemplateConfiguration } from '@cyberismocom/data-handler/interfaces/project-interfaces';

interface NewCardModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string | null;
}

export function TemplateCard({
  name,
  description,
  onClick,
  isChosen,
}: {
  name: string;
  description: string;
  isChosen: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className="templateCard"
      variant="outlined"
      sx={{
        height: '200px',
        width: '200px',
        boxShadow: '0px 2px 2px 0px rgba(0, 0, 0, 0.5)',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        gap: 0,
        borderRadius: 16,
      }}
      onClick={onClick}
    >
      <Stack
        direction="row"
        padding={0}
        height="50%"
        sx={{
          justifyContent: 'space-between',
        }}
      >
        <Typography
          level="title-sm"
          paddingLeft={2}
          fontWeight="bold"
          textOverflow="clip"
          marginTop="auto"
          marginBottom={1}
        >
          {name}
        </Typography>
        <Box padding={1} height="100%">
          <Radio checked={isChosen} variant="soft" />
        </Box>
      </Stack>
      <CardOverflow
        sx={{
          height: '50%',
        }}
      >
        <Box bgcolor="neutral.softBg" height="100%">
          <Typography
            level="body-xs"
            fontWeight="bold"
            paddingLeft={2}
            height="100%"
            paddingTop={1}
          >
            {description}
          </Typography>
        </Box>
      </CardOverflow>
    </Card>
  );
}

export function NewCardModal({ open, onClose, cardKey }: NewCardModalProps) {
  const { t } = useTranslation();
  const [chosenTemplate, setChosenTemplate] = React.useState<string | null>(
    null,
  );
  const [filter, setFilter] = React.useState<string>('');

  const router = useAppRouter();

  const { templates } = useTemplates();

  const { createCard, card, isUpdating } = useCard(cardKey);

  const dispatch = useAppDispatch();

  useEffect(() => {
    setChosenTemplate(null);
  }, [open]);

  // divide templates into categories
  const categories = (templates || []).reduce<
    Record<string, TemplateConfiguration[]>
  >((acc, template) => {
    const category = template.metadata.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    if (
      !filter ||
      template.metadata.displayName
        ?.toLowerCase()
        .includes(filter.toLowerCase()) ||
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
                    <Stack key={category}>
                      <Typography level="title-sm" color="neutral">
                        {category}
                      </Typography>
                      <Grid
                        container
                        spacing={2}
                        columnGap={2}
                        rowGap={2}
                        justifyContent="flex-start"
                        marginTop={2}
                        marginBottom={4}
                        marginLeft={0}
                        paddingRight={1}
                      >
                        {templates.map((template) => (
                          <TemplateCard
                            key={template.name}
                            isChosen={chosenTemplate === template.name}
                            onClick={() => setChosenTemplate(template.name)}
                            name={
                              template.metadata.displayName ?? template.name
                            }
                            description={template.metadata.description ?? ''}
                          />
                        ))}
                      </Grid>
                    </Stack>
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
              loading={isUpdating}
              onClick={async () => {
                if (chosenTemplate) {
                  try {
                    const cards = await createCard(chosenTemplate);
                    dispatch(
                      addNotification({
                        message: t('createCard.success'),
                        type: 'success',
                      }),
                    );

                    if (cards && cards.length > 0) {
                      router.push(`/cards/${cards[0]}`);
                    }
                    onClose();
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
            <Button onClick={onClose} variant="plain" color="neutral">
              {t('cancel')}
            </Button>
            <Box flexGrow={1} />
            <Typography>
              {t('createUnder', { parent: card?.title || 'root' })}
            </Typography>
          </DialogActions>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default NewCardModal;
