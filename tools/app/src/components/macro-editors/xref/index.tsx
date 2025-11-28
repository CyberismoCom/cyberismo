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
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Autocomplete, FormControl, FormHelperText, FormLabel } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { XrefMacroOptions } from '@cyberismo/data-handler';
import {
  DEFAULT_XREF_FORM_VALUES,
  type MacroModalProps,
} from '../shared/types';
import { BaseMacroModal } from '../shared/MacroModal';
import { useCardOptions } from '../shared/hooks';

export function XrefMacroModal({
  open,
  onClose,
  onInsert,
}: MacroModalProps<XrefMacroOptions>) {
  const { t } = useTranslation();
  const { options, isLoading } = useCardOptions();
  const { control, handleSubmit, reset } = useForm({
    defaultValues: DEFAULT_XREF_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_XREF_FORM_VALUES });
    }
  }, [open, reset]);

  const cardKeyValue = useWatch({
    name: 'cardKey',
    control,
  });

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.cardKey) return;
    onInsert({ cardKey: data.cardKey });
    onClose();
  });

  return (
    <BaseMacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!cardKeyValue}
      title={t('asciiDocEditor.macros.xref.title')}
    >
      <FormControl required>
        <FormLabel>{t('asciiDocEditor.macros.xref.cardLabel')}</FormLabel>
        <Controller
          name="cardKey"
          control={control}
          render={({ field }) => {
            const selectedOption =
              options.find((option) => option.value === field.value) ?? null;
            return (
              <Autocomplete
                placeholder={t('asciiDocEditor.macros.xref.cardPlaceholder')}
                options={options}
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
        {options.length === 0 && !isLoading && (
          <FormHelperText>
            {t('asciiDocEditor.macros.common.noCards')}
          </FormHelperText>
        )}
      </FormControl>
    </BaseMacroModal>
  );
}

export default XrefMacroModal;
