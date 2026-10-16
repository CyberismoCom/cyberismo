// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Stack,
  Textarea,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { isPrefixValid, type ProjectFormData } from './projectFormUtils.js';

interface ProjectInfoStepProps {
  form: ProjectFormData;
  onChange: (form: ProjectFormData) => void;
  disabled: boolean;
}

export function ProjectInfoStep({
  form,
  onChange,
  disabled,
}: ProjectInfoStepProps) {
  const { t } = useTranslation();
  const prefixValid = isPrefixValid(form.prefix);

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <FormControl required>
        <FormLabel>{t('projectDialog.name')} *</FormLabel>
        <Input
          autoFocus
          placeholder={t('projectDialog.namePlaceholder')}
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          disabled={disabled}
        />
      </FormControl>
      <FormControl required error={!prefixValid}>
        <FormLabel>{t('projectDialog.prefix')} *</FormLabel>
        <Input
          placeholder={t('projectDialog.prefixPlaceholder')}
          value={form.prefix}
          onChange={(e) =>
            onChange({ ...form, prefix: e.target.value.toLowerCase() })
          }
          disabled={disabled}
        />
        <FormHelperText>{t('projectDialog.prefixHelp')}</FormHelperText>
      </FormControl>
      <FormControl>
        <FormLabel>{t('projectDialog.category')}</FormLabel>
        <Input
          placeholder={t('projectDialog.categoryPlaceholder')}
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
          disabled={disabled}
        />
      </FormControl>
      <FormControl>
        <FormLabel>{t('projectDialog.description')}</FormLabel>
        <Textarea
          minRows={3}
          placeholder={t('projectDialog.descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          disabled={disabled}
        />
      </FormControl>
    </Stack>
  );
}
