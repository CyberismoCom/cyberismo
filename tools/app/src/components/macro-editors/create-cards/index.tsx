// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Option,
  Select,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useTemplates } from '@/lib/api/templates';
import type {
  TemplateConfiguration,
  CreateCardsOptions,
} from '@cyberismo/model';
import { BaseMacroModal } from '../shared/MacroModal';
import {
  DEFAULT_CREATE_CARDS_FORM_VALUES,
  type MacroModalProps,
} from '../shared/types';

export function CreateCardsMacroModal({
  open,
  onClose,
  onInsert,
}: MacroModalProps<CreateCardsOptions>) {
  const { t } = useTranslation();
  const { templates, isLoading } = useTemplates();

  const templateOptions = useMemo(
    () =>
      (templates ?? []).map((template: TemplateConfiguration) => ({
        id: template.name,
        displayName: template.displayName || template.name,
      })),
    [templates],
  );

  const {
    control,
    handleSubmit: handleFormSubmit,
    reset,
    setValue,
    formState: { dirtyFields },
  } = useForm({
    defaultValues: DEFAULT_CREATE_CARDS_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_CREATE_CARDS_FORM_VALUES });
    }
  }, [open, reset]);

  const selectedTemplate = useWatch({
    name: 'template',
    control,
  });
  const buttonLabelValue = useWatch({
    name: 'buttonLabel',
    control,
  });

  useEffect(() => {
    if (selectedTemplate && !dirtyFields.buttonLabel) {
      const template = templateOptions.find(
        (option) => option.id === selectedTemplate,
      );
      if (template) {
        setValue('buttonLabel', `${t('create')} ${template.displayName}`, {
          shouldDirty: false,
        });
      }
    }
  }, [dirtyFields.buttonLabel, selectedTemplate, setValue, t, templateOptions]);

  const handleModalSubmit = handleFormSubmit((data) => {
    if (!data.template || !data.buttonLabel.trim()) return;
    onInsert({
      template: data.template,
      buttonLabel: data.buttonLabel.trim(),
    });
    onClose();
  });

  return (
    <BaseMacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!selectedTemplate || !buttonLabelValue.trim()}
      title={t('asciiDocEditor.macros.createCards.title')}
    >
      <FormControl required>
        <FormLabel>
          {t('asciiDocEditor.macros.createCards.templateLabel')}
        </FormLabel>
        <Controller
          name="template"
          control={control}
          render={({ field }) => (
            <Select
              placeholder={t(
                'asciiDocEditor.macros.createCards.templatePlaceholder',
              )}
              value={field.value || null}
              onChange={(_, value) => field.onChange((value as string) || '')}
            >
              {templateOptions.map((template) => (
                <Option key={template.id} value={template.id}>
                  {template.displayName}
                </Option>
              ))}
            </Select>
          )}
        />
        {templateOptions.length === 0 && !isLoading && (
          <FormHelperText>
            {t('asciiDocEditor.macros.common.noTemplates')}
          </FormHelperText>
        )}
      </FormControl>

      <FormControl required>
        <FormLabel>
          {t('asciiDocEditor.macros.createCards.buttonLabel')}
        </FormLabel>
        <Controller
          name="buttonLabel"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              placeholder={t(
                'asciiDocEditor.macros.createCards.buttonPlaceholder',
              )}
            />
          )}
        />
      </FormControl>
    </BaseMacroModal>
  );
}

export default CreateCardsMacroModal;
