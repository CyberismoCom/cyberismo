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
import { DEFAULT_GRAPH_FORM_VALUES, type OnInsert } from '../shared/types';
import type { GraphOptions } from '@cyberismo/data-handler';

export interface GraphMacroModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: OnInsert<GraphOptions>;
}

export function GraphMacroModal({
  open,
  onClose,
  onInsert,
}: GraphMacroModalProps) {
  const { t } = useTranslation();
  const { resourceTree, isLoading } = useResourceTree();

  const graphViewNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'graphViews'),
    [resourceTree],
  );

  const graphModelNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'graphModels'),
    [resourceTree],
  );

  const {
    control,
    handleSubmit: handleFormSubmit,
    reset,
    watch,
  } = useForm({
    defaultValues: DEFAULT_GRAPH_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_GRAPH_FORM_VALUES });
    }
  }, [open, reset]);

  const selectedGraphView = watch('view');
  const selectedGraphModel = watch('model');

  const handleModalSubmit = handleFormSubmit((data) => {
    if (!data.view || !data.model) return;
    onInsert({
      model: data.model,
      view: data.view,
    });
    onClose();
  });

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      submitDisabled={!selectedGraphView || !selectedGraphModel}
      title={t('asciiDocEditor.macros.graph.title')}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.graph.viewLabel')}</FormLabel>
          <Controller
            name="view"
            control={control}
            render={({ field }) => (
              <Select
                placeholder={t('asciiDocEditor.macros.graph.viewPlaceholder')}
                onChange={(_, value) => field.onChange(value)}
                value={field.value}
              >
                {graphViewNodes.map((node) => (
                  <Option key={node.name} value={node.data.name}>
                    {node.data.displayName || node.data.name}
                  </Option>
                ))}
              </Select>
            )}
          />
          {graphViewNodes.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noGraphViews')}
            </FormHelperText>
          )}
        </FormControl>

        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.graph.modelLabel')}</FormLabel>
          <Controller
            name="model"
            control={control}
            render={({ field }) => (
              <Select
                placeholder={t('asciiDocEditor.macros.graph.modelPlaceholder')}
                onChange={(_, value) => field.onChange(value)}
                value={field.value}
              >
                {graphModelNodes.map((node) => (
                  <Option key={node.name} value={node.data.name}>
                    {node.data.displayName || node.data.name}
                  </Option>
                ))}
              </Select>
            )}
          />
          {graphModelNodes.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noGraphModels')}
            </FormHelperText>
          )}
        </FormControl>
      </Stack>
    </MacroModal>
  );
}

export default GraphMacroModal;
