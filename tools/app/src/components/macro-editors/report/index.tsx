// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  FormControl,
  FormHelperText,
  FormLabel,
  Option,
  Select,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useResourceTree } from '@/lib/api/resources';
import { BaseMacroModal } from '../shared/MacroModal';
import { collectResourceNodes } from '../shared/hooks';
import {
  DEFAULT_REPORT_FORM_VALUES,
  type MacroModalProps,
} from '../shared/types';
import type { ReportOptions } from '@cyberismo/model';

export function ReportMacroModal({
  open,
  onClose,
  onInsert,
}: MacroModalProps<ReportOptions>) {
  const { t } = useTranslation();
  const { resourceTree, isLoading } = useResourceTree();

  const reportNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'reports'),
    [resourceTree],
  );

  const { control, handleSubmit, reset } = useForm({
    defaultValues: DEFAULT_REPORT_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_REPORT_FORM_VALUES });
    }
  }, [open, reset]);

  const selectedReport = useWatch({
    name: 'name',
    control,
  });

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.name) return;
    onInsert({ name: data.name });
    onClose();
  });

  return (
    <BaseMacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!selectedReport}
      title={t('asciiDocEditor.macros.report.title')}
    >
      <FormControl required>
        <FormLabel>{t('asciiDocEditor.macros.report.reportLabel')}</FormLabel>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <Select
              placeholder={t('asciiDocEditor.macros.report.reportPlaceholder')}
              value={field.value || null}
              onChange={(_, value) => field.onChange((value as string) || '')}
            >
              {reportNodes.map((node) => (
                <Option key={node.name} value={node.data.name}>
                  {node.data.displayName || node.data.name}
                </Option>
              ))}
            </Select>
          )}
        />
        {reportNodes.length === 0 && !isLoading && (
          <FormHelperText>
            {t('asciiDocEditor.macros.common.noReports')}
          </FormHelperText>
        )}
      </FormControl>
    </BaseMacroModal>
  );
}

export default ReportMacroModal;
