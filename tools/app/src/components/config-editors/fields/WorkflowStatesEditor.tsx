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

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Typography,
} from '@mui/joy';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useResource } from '@/lib/api';
import { useErrorNotification, useListItemEditing } from '@/lib/hooks';
import { useKeyboardShortcut } from '@/lib/hooks/utils';
import { GenericConfirmModal } from '@/components/modals';
import { WorkflowStateRow } from './WorkflowStateRow';
import {
  WorkflowTransitionRow,
  WorkflowPreviewTransitionRow,
} from './WorkflowTransitionRow';
import { ANY_STATE, FORM_FIELD_MAX_WIDTH, NEW_CARD } from '@/lib/constants';
import type {
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { WorkflowCategory } from '@cyberismo/data-handler/interfaces/resource-interfaces';

// Zod schemas
const createStateSchema = (
  existingNames: Set<string>,
  currentName: string | null,
  t: (key: string) => string,
) =>
  z.object({
    name: z
      .string()
      .min(1, t('workflowStates.stateNameRequired'))
      .refine(
        (val) => val.trim() === currentName || !existingNames.has(val.trim()),
        t('workflowStates.stateNameExists'),
      ),
    category: z.enum(WorkflowCategory),
  });

const createTransitionSchema = (
  existingNames: Set<string>,
  currentName: string | null,
  t: (key: string) => string,
) =>
  z.object({
    name: z
      .string()
      .min(1, t('workflowStates.transitionNameRequired'))
      .refine(
        (val) => val.trim() === currentName || !existingNames.has(val.trim()),
        t('workflowStates.transitionNameExists'),
      ),
    toState: z.string().min(1),
    fromStates: z.array(z.string()),
  });

type StateDraft = z.infer<ReturnType<typeof createStateSchema>>;
type TransitionDraft = z.infer<ReturnType<typeof createTransitionSchema>>;

const CATEGORIES: WorkflowCategory[] = [
  WorkflowCategory.initial,
  WorkflowCategory.active,
  WorkflowCategory.closed,
  WorkflowCategory.none,
];

export function WorkflowStatesEditor({
  workflow,
  readOnly,
}: {
  workflow: Workflow;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const withErrorNotification = useErrorNotification();
  const { update, isUpdating } = useResource(workflow.name);
  const previewRowRef = useRef<HTMLDivElement>(null);

  // Preview transition state (for creating new transitions)
  const [previewTransition, setPreviewTransition] = useState<{
    toState: string;
  } | null>(null);

  // State editing
  const {
    editingItem: editingState,
    itemToDelete: stateToDelete,
    isEditingLocked: stateEditingLocked,
    startEditing: setEditingState,
    cancelEditing: cancelStateEditing,
    setItemToDelete: setStateToDelete,
    clearItemToDelete: clearStateToDelete,
  } = useListItemEditing<WorkflowState>();

  // Transition editing
  const {
    editingItem: editingTransition,
    itemToDelete: transitionToDelete,
    isEditingLocked: transitionEditingLocked,
    startEditing: setEditingTransition,
    cancelEditing: cancelTransitionEditing,
    setItemToDelete: setTransitionToDelete,
    clearItemToDelete: clearTransitionToDelete,
  } = useListItemEditing<WorkflowTransition>();

  // Replacement state for deletion
  const [replacementState, setReplacementState] = useState<string>('');

  // Validation context
  const states = workflow.states || [];
  const transitions = workflow.transitions || [];
  const existingStateNames = new Set(states.map((s) => s.name));
  const existingTransitionNames = new Set(transitions.map((t) => t.name));

  // New state form
  const {
    control: newStateControl,
    handleSubmit: handleNewStateSubmit,
    reset: resetNewState,
    formState: { isValid: isNewStateValid },
  } = useForm<StateDraft>({
    defaultValues: {
      name: '',
      category: WorkflowCategory.active,
    },
    resolver: zodResolver(createStateSchema(existingStateNames, null, t)),
    mode: 'onChange',
  });

  // Edit state form
  const editStateForm = useForm<StateDraft>({
    defaultValues: {
      name: '',
      category: WorkflowCategory.active,
    },
    resolver: zodResolver(
      createStateSchema(existingStateNames, editingState, t),
    ),
    mode: 'onChange',
  });

  // New transition form (used for preview row)
  const newTransitionForm = useForm<TransitionDraft>({
    defaultValues: {
      name: '',
      toState: '',
      fromStates: [ANY_STATE],
    },
    resolver: zodResolver(
      createTransitionSchema(existingTransitionNames, null, t),
    ),
    mode: 'onChange',
  });

  // Edit transition form
  const editTransitionForm = useForm<TransitionDraft>({
    defaultValues: {
      name: '',
      toState: '',
      fromStates: [],
    },
    resolver: zodResolver(
      createTransitionSchema(existingTransitionNames, editingTransition, t),
    ),
    mode: 'onChange',
  });

  const closeStateEditMode = () => {
    cancelStateEditing();
    editStateForm.reset({ name: '', category: WorkflowCategory.active });
  };

  const closeTransitionEditMode = () => {
    cancelTransitionEditing();
    editTransitionForm.reset({ name: '', toState: '', fromStates: [] });
  };

  // Cancel preview transition
  const cancelPreviewTransition = () => {
    setPreviewTransition(null);
    newTransitionForm.reset({ name: '', toState: '', fromStates: [ANY_STATE] });
  };

  // Escape key handling
  useKeyboardShortcut({ key: 'Escape' }, () => {
    if (editingState !== null) {
      closeStateEditMode();
    }
    if (editingTransition !== null) {
      closeTransitionEditMode();
    }
    if (previewTransition !== null) {
      cancelPreviewTransition();
    }
  });

  const disableAll = readOnly || isUpdating();
  const isAnyEditingLocked =
    stateEditingLocked || transitionEditingLocked || previewTransition !== null;

  // --- State handlers ---

  const handleAddState = async (data: StateDraft) => {
    if (disableAll) return;

    await withErrorNotification(
      () =>
        update({
          updateKey: { key: 'states' },
          operation: {
            name: 'add',
            target: {
              name: data.name.trim(),
              category: data.category,
            },
          },
        }),
      {
        successMessage: t('workflowStates.stateAdded'),
        onSuccess: () =>
          resetNewState({ name: '', category: WorkflowCategory.active }),
      },
    );
  };

  const handleSaveStateEdit = async (
    originalState: WorkflowState,
    draft: StateDraft,
  ) => {
    if (disableAll) return;

    const hasChanges =
      draft.name.trim() !== originalState.name ||
      draft.category !== originalState.category;

    if (!hasChanges) {
      closeStateEditMode();
      return;
    }

    await withErrorNotification(
      () =>
        update({
          updateKey: { key: 'states' },
          operation: {
            name: 'change',
            target: { name: originalState.name },
            to: {
              name: draft.name.trim(),
              category: draft.category,
            },
          },
        }),
      {
        successMessage: t('workflowStates.stateUpdated'),
        onSuccess: closeStateEditMode,
      },
    );
  };

  const handleDeleteState = async () => {
    if (disableAll || !stateToDelete || !replacementState) return;

    await withErrorNotification(
      () =>
        update({
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: stateToDelete.name },
            replacementValue: { name: replacementState },
          },
        }),
      {
        successMessage: t('workflowStates.stateDeleted'),
        onSuccess: () => {
          clearStateToDelete();
          setReplacementState('');
        },
      },
    );
  };

  const handleMoveState = async (
    state: WorkflowState,
    direction: 'up' | 'down',
  ) => {
    if (disableAll) return;

    const currentIndex = states.findIndex((s) => s.name === state.name);
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= states.length) return;

    await withErrorNotification(() =>
      update({
        updateKey: { key: 'states' },
        operation: {
          name: 'rank',
          target: state,
          newIndex: targetIndex,
        },
      }),
    );
  };

  const startStateEditing = (state: WorkflowState) => {
    setEditingState(state.name);
    editStateForm.reset({
      name: state.name,
      category: state.category,
    });
  };

  // --- Transition handlers ---

  const handleAddTransition = async (data: TransitionDraft) => {
    if (disableAll) return;

    // If no fromStates selected, use empty string for "new card" pattern
    const fromStates =
      data.fromStates.length === 0 ? [NEW_CARD] : data.fromStates;

    await withErrorNotification(
      () =>
        update({
          updateKey: { key: 'transitions' },
          operation: {
            name: 'add',
            target: {
              name: data.name.trim(),
              toState: data.toState,
              fromState: fromStates,
            },
          },
        }),
      {
        successMessage: t('workflowStates.transitionAdded'),
        onSuccess: () => {
          setPreviewTransition(null);
          newTransitionForm.reset({
            name: '',
            toState: '',
            fromStates: [ANY_STATE],
          });
        },
      },
    );
  };

  const handleSaveTransitionEdit = async (
    originalTransition: WorkflowTransition,
    draft: TransitionDraft,
  ) => {
    if (disableAll) return;

    // If no fromStates selected, use empty string for "new card" pattern
    const fromStates =
      draft.fromStates.length === 0 ? [NEW_CARD] : draft.fromStates;

    const fromStatesEqual =
      fromStates.length === originalTransition.fromState.length &&
      fromStates.every((s) => originalTransition.fromState.includes(s));

    const hasChanges =
      draft.name.trim() !== originalTransition.name ||
      draft.toState !== originalTransition.toState ||
      !fromStatesEqual;

    if (!hasChanges) {
      closeTransitionEditMode();
      return;
    }

    await withErrorNotification(
      () =>
        update({
          updateKey: { key: 'transitions' },
          operation: {
            name: 'change',
            target: { name: originalTransition.name },
            to: {
              name: draft.name.trim(),
              toState: draft.toState,
              fromState: fromStates,
            },
          },
        }),
      {
        successMessage: t('workflowStates.transitionUpdated'),
        onSuccess: closeTransitionEditMode,
      },
    );
  };

  const handleDeleteTransition = async (transition: WorkflowTransition) => {
    if (disableAll) return;

    await withErrorNotification(
      () =>
        update({
          updateKey: { key: 'transitions' },
          operation: {
            name: 'remove',
            target: { name: transition.name },
          },
        }),
      { successMessage: t('workflowStates.transitionDeleted') },
    );
  };

  const handleMoveTransition = async (
    transition: WorkflowTransition,
    direction: 'up' | 'down',
  ) => {
    if (disableAll) return;

    const currentIndex = transitions.findIndex(
      (tr) => tr.name === transition.name,
    );
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= transitions.length) return;

    await withErrorNotification(() =>
      update({
        updateKey: { key: 'transitions' },
        operation: {
          name: 'rank',
          target: transition,
          newIndex: targetIndex,
        },
      }),
    );
  };

  const startTransitionEditing = (transition: WorkflowTransition) => {
    setEditingTransition(transition.name);
    editTransitionForm.reset({
      name: transition.name,
      toState: transition.toState,
      fromStates: [...transition.fromState],
    });
  };

  // "+Transition" button handler - creates preview row with toState pre-filled
  const handleAddTransitionForState = (stateName: string) => {
    newTransitionForm.reset({
      name: '',
      toState: stateName,
      fromStates: [ANY_STATE],
    });
    setPreviewTransition({ toState: stateName });
  };

  // Scroll to preview row when it appears
  useEffect(() => {
    if (previewTransition !== null && previewRowRef.current) {
      previewRowRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [previewTransition]);

  const getCategoryLabel = (category: WorkflowCategory) => {
    switch (category) {
      case 'initial':
        return t('workflowStates.categoryInitial');
      case 'active':
        return t('workflowStates.categoryActive');
      case 'closed':
        return t('workflowStates.categoryClosed');
      case 'none':
        return t('none');
      default:
        return category;
    }
  };

  // Helper to check if a state row is disabled
  const isStateRowDisabled = (stateName: string) => {
    const isEditing = editingState === stateName;
    const lockedByOtherEdit =
      (editingState !== null && !isEditing) || transitionEditingLocked;
    return disableAll || lockedByOtherEdit;
  };

  // Helper to check if a transition row is disabled
  const isTransitionRowDisabled = (transitionName: string) => {
    const isEditing = editingTransition === transitionName;
    const lockedByOtherEdit =
      (editingTransition !== null && !isEditing) || stateEditingLocked;
    return disableAll || lockedByOtherEdit;
  };

  return (
    <>
      {/* States Section */}
      <Box>
        <Typography level="h4" sx={{ mb: 4 }}>
          {t('workflowStates.states')}
        </Typography>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!disableAll && !isAnyEditingLocked) {
              void handleNewStateSubmit(handleAddState)();
            }
          }}
        >
          <Stack spacing={2} sx={{ maxWidth: FORM_FIELD_MAX_WIDTH }}>
            <FormControl>
              <FormLabel>{t('workflowStates.category')}</FormLabel>
              <Controller
                control={newStateControl}
                name="category"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onChange={(_, val) => field.onChange(val)}
                    disabled={disableAll || isAnyEditingLocked}
                  >
                    {CATEGORIES.map((cat) => (
                      <Option key={cat} value={cat}>
                        {getCategoryLabel(cat)}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t('workflowStates.stateName')} *</FormLabel>
              <Controller
                control={newStateControl}
                name="name"
                render={({ field, fieldState }) => (
                  <>
                    <Input
                      value={field.value}
                      onChange={field.onChange}
                      disabled={disableAll || isAnyEditingLocked}
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
            </FormControl>
            <Button
              type="submit"
              variant="solid"
              size="sm"
              disabled={disableAll || isAnyEditingLocked || !isNewStateValid}
            >
              {t('workflowStates.addState')}
            </Button>
          </Stack>
        </form>
      </Box>

      {/* States List */}
      <Stack spacing={1} marginTop={4}>
        {states.map((state, index) => (
          <WorkflowStateRow
            key={state.name}
            state={state}
            index={index}
            total={states.length}
            isEditing={editingState === state.name}
            disabled={isStateRowDisabled(state.name)}
            control={editStateForm.control}
            getCategoryLabel={getCategoryLabel}
            onMoveUp={() => handleMoveState(state, 'up')}
            onMoveDown={() => handleMoveState(state, 'down')}
            onEdit={() => startStateEditing(state)}
            onSave={() =>
              editStateForm.handleSubmit((data) =>
                handleSaveStateEdit(state, data),
              )()
            }
            onCancel={closeStateEditMode}
            onDelete={() => {
              setStateToDelete(state);
              // Pre-select first available replacement state
              const availableStates = states.filter(
                (s) => s.name !== state.name,
              );
              if (availableStates.length > 0) {
                setReplacementState(availableStates[0].name);
              }
            }}
            onAddTransition={() => handleAddTransitionForState(state.name)}
          />
        ))}
      </Stack>

      {/* Transitions Section */}
      <Typography level="h4" marginTop={6} marginBottom={4}>
        {t('workflowStates.transitions')}
      </Typography>

      {/* Transitions List */}
      <Stack spacing={1}>
        {transitions.length === 0 && !previewTransition ? (
          <Typography level="body-sm" color="neutral">
            {t('workflowStates.noTransitions')}
          </Typography>
        ) : (
          transitions.map((transition, index) => (
            <WorkflowTransitionRow
              key={transition.name}
              transition={transition}
              index={index}
              total={transitions.length}
              isEditing={editingTransition === transition.name}
              disabled={isTransitionRowDisabled(transition.name)}
              control={editTransitionForm.control}
              states={states}
              onMoveUp={() => handleMoveTransition(transition, 'up')}
              onMoveDown={() => handleMoveTransition(transition, 'down')}
              onEdit={() => startTransitionEditing(transition)}
              onSave={() =>
                editTransitionForm.handleSubmit((data) =>
                  handleSaveTransitionEdit(transition, data),
                )()
              }
              onCancel={closeTransitionEditMode}
              onDelete={() => setTransitionToDelete(transition)}
            />
          ))
        )}
        {previewTransition && (
          <WorkflowPreviewTransitionRow
            disabled={disableAll}
            control={newTransitionForm.control}
            states={states}
            onSave={() => newTransitionForm.handleSubmit(handleAddTransition)()}
            onCancel={cancelPreviewTransition}
            previewRowRef={previewRowRef}
          />
        )}
      </Stack>

      {/* Delete State Modal - with replacement picker */}
      <GenericConfirmModal
        open={stateToDelete !== null}
        onClose={() => {
          clearStateToDelete();
          setReplacementState('');
        }}
        onConfirm={handleDeleteState}
        title={t('workflowStates.deleteState')}
        content={
          <Stack spacing={2}>
            <Typography>
              {t('workflowStates.deleteStateConfirm', {
                name: stateToDelete?.name,
              })}
            </Typography>
            <FormControl>
              <FormLabel>
                {t('workflowStates.deleteStateReplacement')}
              </FormLabel>
              <Select
                size="sm"
                value={replacementState}
                onChange={(_, val) => setReplacementState(val ?? '')}
              >
                {states
                  .filter((s) => s.name !== stateToDelete?.name)
                  .map((state) => (
                    <Option key={state.name} value={state.name}>
                      {state.name}
                    </Option>
                  ))}
              </Select>
            </FormControl>
          </Stack>
        }
        confirmText={t('delete')}
        confirmDisabled={!replacementState}
      />

      {/* Delete Transition Modal */}
      <GenericConfirmModal
        open={transitionToDelete !== null}
        onClose={clearTransitionToDelete}
        onConfirm={async () => {
          if (transitionToDelete) {
            await handleDeleteTransition(transitionToDelete);
          }
          clearTransitionToDelete();
        }}
        title={t('workflowStates.deleteTransition')}
        content={t('workflowStates.deleteTransitionConfirm', {
          name: transitionToDelete?.name,
        })}
        confirmText={t('delete')}
      />
    </>
  );
}

export default WorkflowStatesEditor;
