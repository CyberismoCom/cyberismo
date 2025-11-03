/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Autocomplete,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import type { IncludeMacroOptions } from '@cyberismo/data-handler';
import { BaseMacroModal } from '../shared/MacroModal';
import { useCardOptions } from '../shared/hooks';
import type { MacroModalProps } from '../shared/types';
import { DEFAULT_INCLUDE_FORM_VALUES } from '../shared/types';

export function IncludeMacroModal({
  open,
  onClose,
  onInsert,
}: MacroModalProps<IncludeMacroOptions>) {
  const { t } = useTranslation();
  const { options: cardOptions, isLoading } = useCardOptions();

  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: DEFAULT_INCLUDE_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_INCLUDE_FORM_VALUES });
    }
  }, [open, reset]);

  const cardKeyValue = watch('cardKey');

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.cardKey) return;

    const payload: IncludeMacroOptions = {
      cardKey: data.cardKey,
    };

    const trimmedLevelOffset = data.levelOffset.trim();
    if (trimmedLevelOffset) {
      payload.levelOffset = trimmedLevelOffset;
    }

    if (data.title) {
      payload.title = data.title;
    }

    if (data.pageTitles) {
      payload.pageTitles = data.pageTitles;
    }

    onInsert(payload);
    onClose();
  });

  return (
    <BaseMacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!cardKeyValue}
      title={t('asciiDocEditor.macros.include.title')}
    >
      <FormControl required>
        <FormLabel>{t('asciiDocEditor.macros.include.cardLabel')}</FormLabel>
        <Controller
          name="cardKey"
          control={control}
          render={({ field }) => {
            const selectedCardOption =
              cardOptions.find((option) => option.value === field.value) ??
              null;
            return (
              <Autocomplete
                placeholder={t('asciiDocEditor.macros.include.cardPlaceholder')}
                options={cardOptions}
                value={selectedCardOption}
                onChange={(_, value) => field.onChange(value?.value || '')}
                getOptionLabel={(option) => option.label}
                isOptionEqualToValue={(option, value) =>
                  option.value === value.value
                }
              />
            );
          }}
        />
        {cardOptions.length === 0 && !isLoading && (
          <FormHelperText>
            {t('asciiDocEditor.macros.common.noCards')}
          </FormHelperText>
        )}
      </FormControl>

      <FormControl>
        <FormLabel>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography level="body-sm">
              {t('asciiDocEditor.macros.include.levelOffset')}
            </Typography>
            <Tooltip
              placement="top"
              title={t('asciiDocEditor.macros.include.levelOffsetTooltip')}
            >
              <InfoOutlined fontSize="small" />
            </Tooltip>
          </Stack>
        </FormLabel>
        <Controller
          name="levelOffset"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              onChange={(event) => field.onChange(event.target.value)}
              placeholder={t(
                'asciiDocEditor.macros.include.levelOffsetPlaceholder',
              )}
            />
          )}
        />
      </FormControl>

      <FormControl>
        <FormLabel>{t('asciiDocEditor.macros.include.includeTitle')}</FormLabel>
        <Controller
          name="title"
          control={control}
          render={({ field }) => (
            <Select
              placeholder={t(
                'asciiDocEditor.macros.include.includeTitlePlaceholder',
              )}
              value={field.value ?? null}
              onChange={(_, value) =>
                field.onChange((value as IncludeMacroOptions['title']) ?? null)
              }
            >
              <Option value="include">
                {t('asciiDocEditor.macros.include.includeTitleOptions.include')}
              </Option>
              <Option value="exclude">
                {t('asciiDocEditor.macros.include.includeTitleOptions.exclude')}
              </Option>
              <Option value="only">
                {t('asciiDocEditor.macros.include.includeTitleOptions.only')}
              </Option>
            </Select>
          )}
        />
      </FormControl>

      <FormControl>
        <FormLabel>{t('asciiDocEditor.macros.include.pageTitles')}</FormLabel>
        <Controller
          name="pageTitles"
          control={control}
          render={({ field }) => (
            <Select
              placeholder={t(
                'asciiDocEditor.macros.include.pageTitlesPlaceholder',
              )}
              value={field.value ?? null}
              onChange={(_, value) =>
                field.onChange(
                  (value as IncludeMacroOptions['pageTitles']) ?? null,
                )
              }
            >
              <Option value="normal">
                {t('asciiDocEditor.macros.include.pageTitlesOptions.normal')}
              </Option>
              <Option value="discrete">
                {t('asciiDocEditor.macros.include.pageTitlesOptions.discrete')}
              </Option>
            </Select>
          )}
        />
      </FormControl>
    </BaseMacroModal>
  );
}

export default IncludeMacroModal;
