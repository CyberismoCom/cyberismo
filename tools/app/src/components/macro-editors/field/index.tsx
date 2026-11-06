// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  Autocomplete,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Option,
  Select,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import {
  FIELD_MACRO_DEFAULT_DISPLAY,
  fieldMacroDefaultShowLabel,
} from '@cyberismo/model';
import type { FieldMacroOptions } from '@cyberismo/model';
import { useCard } from '@/lib/api';
import {
  DEFAULT_FIELD_FORM_VALUES,
  type MacroModalProps,
} from '../shared/types';
import { BaseMacroModal } from '../shared/MacroModal';
import { useCardOptions } from '../shared/hooks';

export interface FieldMacroModalProps extends MacroModalProps<FieldMacroOptions> {
  /**
   * Key of the card being edited; the target when no other card is chosen
   */
  hostCardKey: string;
}

export function FieldMacroModal({
  open,
  onClose,
  onInsert,
  hostCardKey,
}: FieldMacroModalProps) {
  const { t } = useTranslation();
  const { options: cardOptions } = useCardOptions();
  const { control, handleSubmit, reset, setValue } = useForm({
    defaultValues: DEFAULT_FIELD_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_FIELD_FORM_VALUES });
    }
  }, [open, reset]);

  const cardKeyValue = useWatch({ name: 'cardKey', control });
  const fieldValue = useWatch({ name: 'field', control });

  const { card: targetCard } = useCard(
    open ? cardKeyValue || hostCardKey : null,
  );

  const fieldOptions = useMemo(
    () => [
      { value: 'title', label: t('asciiDocEditor.macros.field.title') },
      {
        value: 'workflowState',
        label: t('asciiDocEditor.macros.field.workflowState'),
      },
      ...(targetCard?.fields ?? []).map((f) => ({
        value: f.key,
        label: f.fieldDisplayName || f.key,
      })),
    ],
    [targetCard, t],
  );

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.field) return;
    const options: FieldMacroOptions = { field: data.field };
    if (data.cardKey) options.cardKey = data.cardKey;
    if (data.display !== FIELD_MACRO_DEFAULT_DISPLAY) {
      options.display = data.display;
    }
    if (data.showLabel !== fieldMacroDefaultShowLabel(data.display)) {
      options.showLabel = data.showLabel;
    }
    onInsert(options);
    onClose();
  });

  return (
    <BaseMacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!fieldValue}
      title={t('asciiDocEditor.macros.field.dialogTitle')}
    >
      <FormControl>
        <FormLabel>{t('asciiDocEditor.macros.field.cardLabel')}</FormLabel>
        <Controller
          name="cardKey"
          control={control}
          render={({ field }) => (
            <Autocomplete
              placeholder={t('asciiDocEditor.macros.field.cardPlaceholder')}
              options={cardOptions}
              value={
                cardOptions.find((option) => option.value === field.value) ??
                null
              }
              onChange={(_, value) => {
                field.onChange(value?.value || '');
                setValue('field', '');
              }}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) =>
                option.value === value.value
              }
            />
          )}
        />
      </FormControl>
      <FormControl required>
        <FormLabel>{t('asciiDocEditor.macros.field.fieldLabel')}</FormLabel>
        <Controller
          name="field"
          control={control}
          render={({ field }) => (
            <Select
              placeholder={t('asciiDocEditor.macros.field.fieldPlaceholder')}
              value={field.value || null}
              onChange={(_, value) => field.onChange(value ?? '')}
            >
              {fieldOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          )}
        />
      </FormControl>
      <FormControl>
        <FormLabel>{t('asciiDocEditor.macros.field.displayLabel')}</FormLabel>
        <Controller
          name="display"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onChange={(_, display) => {
                if (!display) return;
                field.onChange(display);
                // The label follows the display; a manual choice is not kept.
                setValue('showLabel', fieldMacroDefaultShowLabel(display));
              }}
            >
              <Option value="row">
                {t('asciiDocEditor.macros.field.displayRow')}
              </Option>
              <Option value="inline">
                {t('asciiDocEditor.macros.field.displayInline')}
              </Option>
            </Select>
          )}
        />
        <FormHelperText>
          {t('asciiDocEditor.macros.field.displayHelp')}
        </FormHelperText>
      </FormControl>
      <Controller
        name="showLabel"
        control={control}
        render={({ field }) => (
          <Checkbox
            label={t('asciiDocEditor.macros.field.showLabel')}
            checked={field.value}
            onChange={(e) => field.onChange(e.target.checked)}
          />
        )}
      />
    </BaseMacroModal>
  );
}

export default FieldMacroModal;
