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

import { useMemo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Option,
  Radio,
  RadioGroup,
  Select,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy';
import { Controller, useForm, useWatch } from 'react-hook-form';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { AnyNode } from '@/lib/api/types';
import type { VisibilityGroup } from '@/lib/api/cardType';
import { useTranslation } from 'react-i18next';
import { useResource, useCardTypeMutations } from '@/lib/api';
import { useAppDispatch, useListItemEditing } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { GenericConfirmModal } from '@/components/modals';
import type { CardType } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { getFieldTypeOptions } from '../resourceFieldConfigs';
import { EditableRowActions } from './EditableRowActions';
import { listRowStyles, reorderButtonContainerStyles } from './listEditorStyles';

type FieldView = {
  name: string;
  displayName: string;
  isCalculated: boolean;
  visibility: VisibilityGroup;
  fieldTypeLabel: string;
};

type NewFieldDraft = {
  name: string;
  displayName: string;
  isCalculated: boolean;
  visibility: VisibilityGroup;
};

type EditFieldDraft = {
  displayName: string;
  isCalculated: boolean;
};

const visibilityToKey: Record<VisibilityGroup, string | null> = {
  always: 'alwaysVisibleFields',
  optional: 'optionallyVisibleFields',
  hidden: null,
};

export function CardTypeFieldsEditor({
  cardType,
  resourceTree,
  readOnly,
}: {
  cardType: CardType;
  resourceTree: AnyNode[];
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { update, isUpdating } = useResource(cardType.name);
  const {
    updateFieldVisibility: updateVisibility,
    isUpdating: isVisibilityUpdating,
  } = useCardTypeMutations(cardType.name);

  const {
    editingItem: editingField,
    itemToDelete: fieldToDelete,
    isEditingLocked,
    startEditing: setEditingField,
    cancelEditing,
    setItemToDelete: setFieldToDelete,
    clearItemToDelete,
  } = useListItemEditing<string>();

  const {
    control: newFieldControl,
    handleSubmit: handleNewSubmit,
    reset: resetNewField,
  } = useForm<NewFieldDraft>({
    defaultValues: {
      name: '',
      displayName: '',
      isCalculated: false,
      visibility: 'always',
    },
  });

  const {
    control: editFieldControl,
    reset: resetEditField,
    handleSubmit: handleEditSubmit,
  } = useForm<EditFieldDraft>({
    defaultValues: {
      displayName: '',
      isCalculated: false,
    },
  });

  const newFieldValues = useWatch({ control: newFieldControl });

  const fieldTypeOptions = useMemo(
    () => getFieldTypeOptions(resourceTree),
    [resourceTree],
  );

  const fieldTypeDisplayNameMap = useMemo(
    () =>
      new Map(
        fieldTypeOptions.map((option) => [option.id, option.displayName]),
      ),
    [fieldTypeOptions],
  );

  const customFields = cardType.customFields || [];
  const alwaysVisible = cardType.alwaysVisibleFields || [];
  const optionallyVisible = cardType.optionallyVisibleFields || [];

  const usedFieldNames = new Set(customFields.map((field) => field.name));

  const availableFieldTypes = fieldTypeOptions.filter(
    (option) => !usedFieldNames.has(option.id),
  );

  const buildFieldView = (
    name: string,
    visibility: VisibilityGroup,
  ): FieldView => {
    const existing = customFields.find((field) => field.name === name);
    return {
      name,
      displayName: existing?.displayName ?? '',
      isCalculated: existing?.isCalculated ?? false,
      visibility,
      fieldTypeLabel: fieldTypeDisplayNameMap.get(name) ?? name,
    };
  };

  const fields = {
    always: alwaysVisible.map((name) => buildFieldView(name, 'always')),
    optional: optionallyVisible.map((name) => buildFieldView(name, 'optional')),
    hidden: customFields
      .filter(
        (field) =>
          !alwaysVisible.includes(field.name) &&
          !optionallyVisible.includes(field.name),
      )
      .map((field) => buildFieldView(field.name, 'hidden')),
  };

  const busy = isUpdating() || isVisibilityUpdating();
  const disableAll = readOnly || busy;

  const handleAddField = async (data: NewFieldDraft) => {
    if (!data.name || disableAll) return;

    try {
      await update({
        updateKey: { key: 'customFields' },
        operation: {
          name: 'add',
          target: {
            name: data.name,
            displayName: data.displayName.trim(),
            isCalculated: data.isCalculated,
          },
        },
      });

      const addKey = visibilityToKey[data.visibility];
      if (addKey) {
        await update({
          updateKey: { key: addKey },
          operation: {
            name: 'add',
            target: data.name,
          },
        });
      }

      dispatch(
        addNotification({
          message: t('customFieldAdded'),
          type: 'success',
        }),
      );
      resetNewField({
        name: '',
        displayName: '',
        isCalculated: false,
        visibility: 'always',
      });
    } catch (error) {
      dispatch(
        addNotification({
          message:
            error instanceof Error ? error.message : (t('unknownError') ?? ''),
          type: 'error',
        }),
      );
    }
  };

  const handleDeleteField = async (fieldName: string) => {
    if (disableAll) return;
    try {
      await update({
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: fieldName },
      });
      dispatch(
        addNotification({
          message: t('customFieldDeleted'),
          type: 'success',
        }),
      );
    } catch (error) {
      dispatch(
        addNotification({
          message:
            error instanceof Error ? error.message : (t('unknownError') ?? ''),
          type: 'error',
        }),
      );
    }
  };

  const handleFieldVisibilityUpdate = async (
    fieldName: string,
    group: VisibilityGroup,
    index?: number,
  ) => {
    if (disableAll) return;
    try {
      await updateVisibility({ fieldName, group, index });
    } catch (error) {
      dispatch(
        addNotification({
          message:
            error instanceof Error ? error.message : (t('unknownError') ?? ''),
          type: 'error',
        }),
      );
    }
  };

  const handleMove = async (
    fieldName: string,
    visibility: Exclude<VisibilityGroup, 'hidden'>,
    direction: 'up' | 'down',
  ) => {
    if (disableAll) return;
    const list =
      visibility === 'always'
        ? alwaysVisible.slice()
        : optionallyVisible.slice();
    const currentIndex = list.indexOf(fieldName);
    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1) return;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    await handleFieldVisibilityUpdate(fieldName, visibility, targetIndex);
  };

  const visibilityOrder: VisibilityGroup[] = ['always', 'optional', 'hidden'];

  const handleChangeGroup = async (
    fieldName: string,
    currentVisibility: VisibilityGroup,
    direction: 'up' | 'down',
  ) => {
    if (disableAll) return;

    const currentIndex = visibilityOrder.indexOf(currentVisibility);
    const len = visibilityOrder.length;
    const targetIndex =
      direction === 'up'
        ? (currentIndex - 1 + len) % len
        : (currentIndex + 1) % len;

    const targetVisibility = visibilityOrder[targetIndex];
    await handleFieldVisibilityUpdate(fieldName, targetVisibility);
  };

  const closeEditMode = () => {
    cancelEditing();
    resetEditField({ displayName: '', isCalculated: false });
  };

  const handleSaveEdit = async (field: FieldView, draft: EditFieldDraft) => {
    if (!draft || disableAll) return;

    const trimmedDisplayName = draft.displayName.trim();

    // Check if anything actually changed
    const hasChanges =
      trimmedDisplayName !== field.displayName ||
      draft.isCalculated !== field.isCalculated;

    if (!hasChanges) {
      closeEditMode();
      return;
    }

    try {
      await update({
        updateKey: { key: 'customFields' },
        operation: {
          name: 'change',
          target: field.name,
          to: {
            name: field.name,
            displayName: trimmedDisplayName,
            isCalculated: draft.isCalculated,
          },
        },
      });
      dispatch(
        addNotification({
          message: t('customFieldUpdated', { field: field.name }),
          type: 'success',
        }),
      );
      closeEditMode();
    } catch (error) {
      dispatch(
        addNotification({
          message:
            error instanceof Error ? error.message : (t('unknownError') ?? ''),
          type: 'error',
        }),
      );
    }
  };

  const startEditing = (field: FieldView) => {
    setEditingField(field.name);
    resetEditField({
      displayName: field.displayName,
      isCalculated: field.isCalculated,
    });
  };

  const renderFieldRow = (
    field: FieldView,
    groupVisibility: VisibilityGroup,
    index: number,
    total: number,
  ) => {
    const isEditing = editingField === field.name;
    const lockedByOtherEdit = editingField !== null && !isEditing;
    const rowDisabled = disableAll || lockedByOtherEdit;

    const canMoveUp = groupVisibility !== 'hidden' && index > 0;
    const canMoveDown = groupVisibility !== 'hidden' && index < total - 1;

    return (
      <Sheet
        key={field.name}
        variant="outlined"
        sx={{ ...listRowStyles, py: 0 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Stack spacing={-0.5} sx={reorderButtonContainerStyles}>
            <IconButton
              size="sm"
              variant="plain"
              color="primary"
              disabled={rowDisabled}
              onClick={() =>
                handleChangeGroup(field.name, groupVisibility, 'up')
              }
              title={t('moveToHigherVisibility')}
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              disabled={rowDisabled || !canMoveUp}
              onClick={() =>
                handleMove(
                  field.name,
                  groupVisibility as Exclude<VisibilityGroup, 'hidden'>,
                  'up',
                )
              }
              title={t('moveUp')}
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              disabled={rowDisabled || !canMoveDown}
              onClick={() =>
                handleMove(
                  field.name,
                  groupVisibility as Exclude<VisibilityGroup, 'hidden'>,
                  'down',
                )
              }
              title={t('moveDown')}
              sx={{ mt: 0.5 }}
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="sm"
              variant="plain"
              color="primary"
              disabled={rowDisabled}
              onClick={() =>
                handleChangeGroup(field.name, groupVisibility, 'down')
              }
              title={t('moveToLowerVisibility')}
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack flex={1} spacing={0.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box flex={1}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('fieldType')}
                </Typography>
                <Typography level="body-xs" textColor="text.primary">
                  {field.fieldTypeLabel}
                </Typography>
              </Box>
              <Box flex={1}>
                <Typography
                  level="body-xs"
                  fontWeight="lg"
                  textColor="text.primary"
                >
                  {t('displayName')}
                </Typography>
                {isEditing ? (
                  <Controller
                    name="displayName"
                    control={editFieldControl}
                    render={({ field: ctrl }) => (
                      <Input
                        size="sm"
                        placeholder={t('displayName')}
                        value={ctrl.value ?? ''}
                        onChange={ctrl.onChange}
                        disabled={rowDisabled}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !rowDisabled) {
                            e.preventDefault();
                            void handleEditSubmit((data) =>
                              handleSaveEdit(field, data),
                            )();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            closeEditMode();
                          }
                        }}
                      />
                    )}
                  />
                ) : (
                  <Typography level="body-xs" textColor="text.primary">
                    {field.displayName || '-'}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Stack>

          {isEditing ? (
            <Controller
              name="isCalculated"
              control={editFieldControl}
              render={({ field: ctrl }) => (
                <Checkbox
                  size="sm"
                  label={t('isCalculated')}
                  checked={!!ctrl.value}
                  disabled={rowDisabled}
                  onChange={(event) => ctrl.onChange(event.target.checked)}
                />
              )}
            />
          ) : (
            <Checkbox
              size="sm"
              label={t('isCalculated')}
              checked={field.isCalculated}
              disabled
            />
          )}

          <EditableRowActions
            isEditing={isEditing}
            disabled={rowDisabled}
            onEdit={() => startEditing(field)}
            onDelete={() => setFieldToDelete(field.name)}
            onSave={() =>
              void handleEditSubmit((data) => handleSaveEdit(field, data))()
            }
            onCancel={closeEditMode}
          />
        </Stack>
      </Sheet>
    );
  };

  const renderGroup = (
    label: string,
    groupFields: FieldView[],
    groupVisibility: VisibilityGroup,
  ) => (
    <Stack spacing={1}>
      <Typography level="body-sm" fontWeight="lg" textColor="text.primary">
        {label}
      </Typography>
      <Stack spacing={1}>
        {groupFields.length === 0 ? (
          <Typography level="body-sm" color="neutral">
            {t('noCustomFields')}
          </Typography>
        ) : (
          groupFields.map((field, index) =>
            renderFieldRow(field, groupVisibility, index, groupFields.length),
          )
        )}
      </Stack>
    </Stack>
  );

  return (
    <Stack spacing={7}>
      <Box>
        <Typography level="h4" sx={{ mb: 4 }}>
          {t('customFields')}
        </Typography>
        <Stack spacing={1.25}>
          <FormControl>
            <FormLabel>{t('visibility')}</FormLabel>
            <Controller
              control={newFieldControl}
              name="visibility"
              render={({ field }) => (
                <RadioGroup
                  orientation="horizontal"
                  value={field.value}
                  onChange={(event) =>
                    field.onChange(
                      (event.target as HTMLInputElement)
                        .value as VisibilityGroup,
                    )
                  }
                  sx={{ gap: 2 }}
                >
                  <Radio
                    value="always"
                    label={t('alwaysVisibleFields')}
                    disabled={disableAll || isEditingLocked}
                  />
                  <Radio
                    value="optional"
                    label={t('optionallyVisibleFields')}
                    disabled={disableAll || isEditingLocked}
                  />
                  <Radio
                    value="hidden"
                    label={t('notVisible')}
                    disabled={disableAll || isEditingLocked}
                  />
                </RadioGroup>
              )}
            />
          </FormControl>

          <FormControl>
            <FormLabel>{t('fieldType')}</FormLabel>
            <Controller
              control={newFieldControl}
              name="name"
              rules={{ required: true }}
              render={({ field }) => (
                <Select
                  value={field.value}
                  placeholder={t('selectResource')}
                  onChange={(_, value) =>
                    field.onChange((value as string) ?? '')
                  }
                  size="sm"
                  disabled={
                    disableAll ||
                    isEditingLocked ||
                    availableFieldTypes.length === 0
                  }
                >
                  {availableFieldTypes.map((option) => (
                    <Option key={option.id} value={option.id}>
                      {option.displayName}
                    </Option>
                  ))}
                </Select>
              )}
            />
          </FormControl>

          <FormControl>
            <FormLabel>{t('displayName')}</FormLabel>
            <Controller
              control={newFieldControl}
              name="displayName"
              render={({ field }) => (
                <Input
                  size="sm"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disableAll || isEditingLocked}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !disableAll &&
                      !isEditingLocked &&
                      newFieldValues.name &&
                      availableFieldTypes.length > 0
                    ) {
                      e.preventDefault();
                      void handleNewSubmit(handleAddField)();
                    }
                  }}
                />
              )}
            />
          </FormControl>

          <Controller
            control={newFieldControl}
            name="isCalculated"
            render={({ field }) => (
              <Checkbox
                size="sm"
                label={t('isCalculated')}
                checked={field.value}
                disabled={disableAll || isEditingLocked}
                onChange={(event) => field.onChange(event.target.checked)}
              />
            )}
          />

          <Button
            variant="solid"
            size="sm"
            sx={{ alignSelf: 'stretch' }}
            onClick={() => void handleNewSubmit(handleAddField)()}
            disabled={
              disableAll ||
              isEditingLocked ||
              !newFieldValues.name ||
              availableFieldTypes.length === 0
            }
          >
            {t('add')}
          </Button>
        </Stack>
      </Box>

      <Stack spacing={4}>
        {renderGroup(t('alwaysVisibleFields'), fields.always, 'always')}
        {renderGroup(t('optionallyVisibleFields'), fields.optional, 'optional')}
        {renderGroup(t('notVisible'), fields.hidden, 'hidden')}
      </Stack>

      <GenericConfirmModal
        open={fieldToDelete !== null}
        onClose={clearItemToDelete}
        onConfirm={async () => {
          if (fieldToDelete) {
            await handleDeleteField(fieldToDelete);
          }
          clearItemToDelete();
        }}
        title={t('deleteCustomField')}
        content={t('deleteCustomFieldConfirm', { field: fieldToDelete })}
        confirmText={t('delete')}
      />
    </Stack>
  );
}

export default CardTypeFieldsEditor;
