/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Box,
  Button,
  IconButton,
  Input,
  Option,
  Select,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy';
import { Controller, useFormState, type Control } from 'react-hook-form';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { formKeyHandler } from '@/lib/hooks/utils';
import { EditableRowActions } from './EditableRowActions';
import {
  listRowStyles,
  reorderButtonContainerStyles,
} from './listEditorStyles';
import type { WorkflowState } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { WorkflowCategory } from '@cyberismo/data-handler/interfaces/resource-interfaces';

const CATEGORIES: WorkflowCategory[] = [
  WorkflowCategory.initial,
  WorkflowCategory.active,
  WorkflowCategory.closed,
  WorkflowCategory.none,
];

export interface StateFormData {
  name: string;
  category: WorkflowCategory;
}

export interface WorkflowStateRowProps {
  state: WorkflowState;
  index: number;
  total: number;
  isEditing: boolean;
  disabled: boolean;
  control: Control<StateFormData>;
  getCategoryLabel: (category: WorkflowCategory) => string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onAddTransition: () => void;
}

export function WorkflowStateRow({
  state,
  index,
  total,
  isEditing,
  disabled,
  control,
  getCategoryLabel,
  onMoveUp,
  onMoveDown,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onAddTransition,
}: WorkflowStateRowProps) {
  const { t } = useTranslation();
  const { isValid } = useFormState({ control });

  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;
  const canSave = !disabled && isValid;

  const handleRowKeyDown = formKeyHandler({
    canSubmit: canSave,
    onSubmit: onSave,
    onCancel,
  });

  return (
    <Sheet variant="outlined" sx={listRowStyles}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Stack spacing={-0.5} sx={reorderButtonContainerStyles}>
          <IconButton
            size="sm"
            variant="plain"
            color="neutral"
            disabled={disabled || !canMoveUp}
            onClick={onMoveUp}
            title={t('moveUp')}
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="sm"
            variant="plain"
            color="neutral"
            disabled={disabled || !canMoveDown}
            onClick={onMoveDown}
            title={t('moveDown')}
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack flex={1} spacing={0.5} sx={{ minWidth: 0 }}>
          {isEditing ? (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ minWidth: 0 }}
            >
              <Box sx={{ width: 100, flexShrink: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('workflowStates.category')}
                </Typography>
                <Controller
                  name="category"
                  control={control}
                  render={({ field: ctrl }) => (
                    <Select
                      size="sm"
                      value={ctrl.value}
                      onChange={(_, val) => ctrl.onChange(val)}
                      disabled={disabled}
                    >
                      {CATEGORIES.map((cat) => (
                        <Option key={cat} value={cat}>
                          {getCategoryLabel(cat)}
                        </Option>
                      ))}
                    </Select>
                  )}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('workflowStates.stateName')}
                </Typography>
                <Controller
                  name="name"
                  control={control}
                  render={({ field: ctrl, fieldState }) => (
                    <>
                      <Input
                        size="sm"
                        value={ctrl.value ?? ''}
                        onChange={ctrl.onChange}
                        disabled={disabled}
                        onKeyDown={handleRowKeyDown}
                        error={!!fieldState.error}
                      />
                      {fieldState.error && (
                        <Typography level="body-xs" color="danger">
                          {fieldState.error.message}
                        </Typography>
                      )}
                    </>
                  )}
                />
              </Box>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ width: 100, flexShrink: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('workflowStates.category')}
                </Typography>
                <Typography level="body-xs" textColor="text.primary">
                  {getCategoryLabel(state.category ?? WorkflowCategory.none)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('workflowStates.stateName')}
                </Typography>
                <Typography level="body-xs" textColor="text.primary">
                  {state.name}
                </Typography>
              </Box>
            </Stack>
          )}
        </Stack>

        {!isEditing && (
          <Button
            size="sm"
            variant="solid"
            color="primary"
            startDecorator={<AddIcon />}
            disabled={disabled}
            onClick={onAddTransition}
          >
            {t('workflowStates.addTransition')}
          </Button>
        )}

        <EditableRowActions
          isEditing={isEditing}
          disabled={isEditing ? !canSave : disabled}
          onEdit={onEdit}
          onDelete={onDelete}
          onSave={onSave}
          onCancel={onCancel}
        />
      </Stack>
    </Sheet>
  );
}

export default WorkflowStateRow;
