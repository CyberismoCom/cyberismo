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
  Checkbox,
  Input,
  Option,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { Controller, useFormState, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { formKeyHandler } from '@/lib/hooks/utils';
import { EditableRowActions } from './EditableRowActions';
import { ListRow } from './ListRow';
import { ReorderButton, ReorderButtonContainer } from './ReorderButtons';
import type {
  WorkflowState,
  WorkflowTransition,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { ANY_STATE, NEW_CARD } from '@/lib/constants';

export interface TransitionFormData {
  name: string;
  toState: string;
  fromStates: string[];
}

export interface WorkflowTransitionRowProps {
  transition: WorkflowTransition;
  index: number;
  total: number;
  isEditing: boolean;
  disabled: boolean;
  control: Control<TransitionFormData>;
  states: WorkflowState[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function TransitionEditContent({
  control,
  disabled,
  onKeyDown,
  states,
  autoFocus,
}: {
  control: Control<TransitionFormData>;
  disabled: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  states: WorkflowState[];
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="flex-start"
      sx={{ minWidth: 0 }}
    >
      {/* Transition Name - fixed width */}
      <Box sx={{ width: 150, flexShrink: 0 }}>
        <Typography level="body-xs" fontWeight="lg" textColor="text.primary">
          {t('workflowStates.transitionName')}*
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
                onKeyDown={onKeyDown}
                autoFocus={autoFocus}
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
      {/* To State - fixed width */}
      <Box sx={{ width: 120, flexShrink: 0 }}>
        <Typography level="body-xs" fontWeight="lg" textColor="text.primary">
          {t('workflowStates.transitionTo')}*
        </Typography>
        <Controller
          name="toState"
          control={control}
          render={({ field: ctrl }) => (
            <Select
              size="sm"
              value={ctrl.value}
              onChange={(_, val) => ctrl.onChange(val)}
              disabled={disabled}
            >
              {states.map((state) => (
                <Option key={state.name} value={state.name}>
                  {state.name}
                </Option>
              ))}
            </Select>
          )}
        />
      </Box>
      {/* From States - takes remaining space */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          level="body-xs"
          fontWeight="lg"
          textColor="text.primary"
          sx={{ mb: 0.5 }}
        >
          {t('workflowStates.fromStates')}
        </Typography>
        <Controller
          name="fromStates"
          control={control}
          render={({ field: ctrl }) => {
            const isNewCard =
              ctrl.value.length === 0 ||
              (ctrl.value.length === 1 && ctrl.value[0] === NEW_CARD);
            const isAnyState = ctrl.value.includes(ANY_STATE);

            return (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {/* New card - empty array option */}
                <Tooltip title={t('workflowStates.newCardDesc')}>
                  <Checkbox
                    size="sm"
                    label={t('workflowStates.newCard')}
                    checked={isNewCard}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Clear all other selections
                        ctrl.onChange([]);
                      }
                      // On uncheck: no-op, selecting other options will clear it
                    }}
                    disabled={disabled}
                  />
                </Tooltip>
                {/* Any state (*) - wildcard option */}
                <Tooltip title={t('workflowStates.anyStateDesc')}>
                  <Checkbox
                    size="sm"
                    label={t('workflowStates.anyState')}
                    checked={isAnyState}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Clear new card and all specific states
                        ctrl.onChange([ANY_STATE]);
                      } else {
                        ctrl.onChange(
                          ctrl.value.filter((s: string) => s !== ANY_STATE),
                        );
                      }
                    }}
                    disabled={disabled}
                  />
                </Tooltip>
                {/* Each state */}
                {states.map((state) => (
                  <Checkbox
                    key={state.name}
                    size="sm"
                    label={state.name}
                    checked={ctrl.value.includes(state.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Remove NEW_CARD if present, then add the state
                        const filtered = ctrl.value.filter(
                          (s: string) => s !== NEW_CARD,
                        );
                        ctrl.onChange([...filtered, state.name]);
                      } else {
                        ctrl.onChange(
                          ctrl.value.filter((s: string) => s !== state.name),
                        );
                      }
                    }}
                    disabled={disabled}
                  />
                ))}
              </Stack>
            );
          }}
        />
      </Box>
    </Stack>
  );
}

export function WorkflowTransitionRow({
  transition,
  index,
  total,
  isEditing,
  disabled,
  control,
  states,
  onMoveUp,
  onMoveDown,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: WorkflowTransitionRowProps) {
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
    <ListRow>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <ReorderButtonContainer>
          <ReorderButton
            direction="up"
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
            title={t('moveUp')}
          />
          <ReorderButton
            direction="down"
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
            title={t('moveDown')}
          />
        </ReorderButtonContainer>

        <Stack flex={1} spacing={0.5} sx={{ minWidth: 0 }}>
          {isEditing ? (
            <TransitionEditContent
              control={control}
              disabled={disabled}
              onKeyDown={handleRowKeyDown}
              states={states}
            />
          ) : (
            <Stack direction="row" spacing={1} alignItems="flex-start">
              {/* Transition Name - fixed width */}
              <Box sx={{ width: 150, flexShrink: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('workflowStates.transitionName')}
                </Typography>
                <Typography level="body-xs" textColor="text.primary">
                  {transition.name}
                </Typography>
              </Box>
              {/* To State - fixed width */}
              <Box sx={{ width: 120, flexShrink: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('workflowStates.transitionTo')}
                </Typography>
                <Typography level="body-xs" textColor="text.primary">
                  {transition.toState}
                </Typography>
              </Box>
              {/* From States - takes remaining space */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                  sx={{ mb: 0.5 }}
                >
                  {t('workflowStates.fromStates')}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {/* New card checkbox */}
                  <Tooltip title={t('workflowStates.newCardDesc')}>
                    <Checkbox
                      size="sm"
                      label={t('workflowStates.newCard')}
                      checked={
                        transition.fromState.length === 0 ||
                        (transition.fromState.length === 1 &&
                          transition.fromState[0] === NEW_CARD)
                      }
                      disabled
                    />
                  </Tooltip>
                  <Tooltip title={t('workflowStates.anyStateDesc')}>
                    <Checkbox
                      size="sm"
                      label={t('workflowStates.anyState')}
                      checked={transition.fromState.includes(ANY_STATE)}
                      disabled
                    />
                  </Tooltip>
                  {/* Each state */}
                  {states.map((state) => (
                    <Checkbox
                      key={state.name}
                      size="sm"
                      label={state.name}
                      checked={transition.fromState.includes(state.name)}
                      disabled
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          )}
        </Stack>

        <EditableRowActions
          isEditing={isEditing}
          disabled={isEditing ? !canSave : disabled}
          onEdit={onEdit}
          onDelete={onDelete}
          onSave={onSave}
          onCancel={onCancel}
        />
      </Stack>
    </ListRow>
  );
}

export interface WorkflowPreviewTransitionRowProps {
  disabled: boolean;
  control: Control<TransitionFormData>;
  states: WorkflowState[];
  onSave: () => void;
  onCancel: () => void;
  previewRowRef: React.RefObject<HTMLDivElement | null>;
}

export function WorkflowPreviewTransitionRow({
  disabled,
  control,
  states,
  onSave,
  onCancel,
  previewRowRef,
}: WorkflowPreviewTransitionRowProps) {
  const { isValid } = useFormState({ control });
  const canSave = !disabled && isValid;

  const handlePreviewKeyDown = formKeyHandler({
    canSubmit: canSave,
    onSubmit: onSave,
    onCancel,
  });

  return (
    <ListRow ref={previewRowRef}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        {/* Empty space where reorder buttons would be */}
        <ReorderButtonContainer>
          <ReorderButton direction="up" onClick={() => {}} disabled />
          <ReorderButton direction="down" onClick={() => {}} disabled />
        </ReorderButtonContainer>

        <Stack flex={1} spacing={0.5} sx={{ minWidth: 0 }}>
          <TransitionEditContent
            control={control}
            disabled={disabled}
            onKeyDown={handlePreviewKeyDown}
            states={states}
            autoFocus
          />
        </Stack>

        <EditableRowActions
          isEditing={true}
          disabled={!canSave}
          onEdit={() => {}}
          onDelete={() => {}}
          onSave={onSave}
          onCancel={onCancel}
        />
      </Stack>
    </ListRow>
  );
}

export default WorkflowTransitionRow;
