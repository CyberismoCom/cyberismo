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
  Option,
  Select,
  Stack,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useResourceTree } from '@/lib/api/resources';
import { MacroModal } from '../shared/MacroModal';
import { collectResourceNodes } from '../shared/hooks';
import { DEFAULT_REPORT_FORM_VALUES } from '../shared/types';
import type { ReportOptions } from '@cyberismo/data-handler';

export interface ReportMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: ReportOptions) => void;
}

export function ReportMacroModal({
  open,
  onClose,
  onInsert,
}: ReportMacroDialogProps) {
  const { t } = useTranslation();
  const { resourceTree, isLoading } = useResourceTree();

  const reportNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'reports'),
    [resourceTree],
  );

  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: DEFAULT_REPORT_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_REPORT_FORM_VALUES });
    }
  }, [open, reset]);

  const selectedReport = watch('name');

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.name) return;
    onInsert({ name: data.name });
    onClose();
  });

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!selectedReport}
      title={t('asciiDocEditor.macros.report.title')}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.report.reportLabel')}</FormLabel>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <Select
                placeholder={t(
                  'asciiDocEditor.macros.report.reportPlaceholder',
                )}
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
      </Stack>
    </MacroModal>
  );
}

export default ReportMacroModal;
