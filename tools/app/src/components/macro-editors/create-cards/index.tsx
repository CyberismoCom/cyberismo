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

import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import type { TemplateConfiguration } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import type { CreateCardsOptions } from '@cyberismo/data-handler';
import { MacroModal } from '../shared/MacroModal';
import { DEFAULT_CREATE_CARDS_FORM_VALUES } from '../shared/types';

export interface CreateCardsMacroModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: CreateCardsOptions) => void;
}

export function CreateCardsMacroModal({
  open,
  onClose,
  onInsert,
}: CreateCardsMacroModalProps) {
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
    watch,
  } = useForm({
    defaultValues: DEFAULT_CREATE_CARDS_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_CREATE_CARDS_FORM_VALUES });
    }
  }, [open, reset]);

  const selectedTemplate = watch('template');
  const buttonLabelValue = watch('buttonLabel');

  useEffect(() => {
    if (selectedTemplate && !buttonLabelValue) {
      const template = templateOptions.find(
        (option) => option.id === selectedTemplate,
      );
      if (template) {
        setValue('buttonLabel', `${t('create')} ${template.displayName}`);
      }
    }
  }, [selectedTemplate, templateOptions, t, buttonLabelValue, setValue]);

  const handleModalSubmit = handleFormSubmit((data) => {
    if (!data.template || !data.buttonLabel.trim()) return;
    onInsert({
      template: data.template,
      buttonLabel: data.buttonLabel.trim(),
    });
    onClose();
  });

  return (
    <MacroModal
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
    </MacroModal>
  );
}

export default CreateCardsMacroModal;
