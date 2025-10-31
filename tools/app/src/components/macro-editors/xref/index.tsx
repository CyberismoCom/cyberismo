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
  Stack,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { XrefMacroOptions } from '@cyberismo/data-handler';
import { DEFAULT_XREF_FORM_VALUES } from '../shared/types';
import { MacroModal } from '../shared/MacroModal';
import { useCardOptions } from '../shared/hooks';

export interface XrefMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: XrefMacroOptions) => void;
}

export function XrefMacroModal({
  open,
  onClose,
  onInsert,
}: XrefMacroDialogProps) {
  const { t } = useTranslation();
  const { options: cardOptions, isLoading } = useCardOptions();
  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: DEFAULT_XREF_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_XREF_FORM_VALUES });
    }
  }, [open, reset]);

  const cardKeyValue = watch('cardKey');

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.cardKey) return;
    onInsert({ cardKey: data.cardKey });
    onClose();
  });

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!cardKeyValue}
      title={t('asciiDocEditor.macros.xref.title')}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.xref.cardLabel')}</FormLabel>
          <Controller
            name="cardKey"
            control={control}
            render={({ field }) => {
              const selectedOption =
                cardOptions.find((option) => option.value === field.value) ??
                null;
              return (
                <Autocomplete
                  placeholder={t('asciiDocEditor.macros.xref.cardPlaceholder')}
                  options={cardOptions}
                  value={selectedOption}
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
      </Stack>
    </MacroModal>
  );
}

export default XrefMacroModal;
