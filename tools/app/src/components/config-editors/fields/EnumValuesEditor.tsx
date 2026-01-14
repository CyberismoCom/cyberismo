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
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy';
import { Controller, useForm, useWatch } from 'react-hook-form';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useTranslation } from 'react-i18next';
import { useResource } from '@/lib/api';
import { useAppDispatch, useListItemEditing } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { GenericConfirmModal } from '@/components/modals';
import { EditableRowActions } from './EditableRowActions';
import {
  listRowStyles,
  reorderButtonContainerStyles,
} from './listEditorStyles';
import type {
  FieldType,
  EnumDefinition,
  DataType,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';

type NewEnumDraft = {
  enumValue: string;
  enumDisplayValue: string;
  enumDescription: string;
};

type EditEnumDraft = {
  enumValue: string;
  enumDisplayValue: string;
  enumDescription: string;
};

const ENUM_DATA_TYPES: DataType[] = ['enum', 'list'];

export function EnumValuesEditor({
  fieldType,
  readOnly,
}: {
  fieldType: FieldType;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { update, isUpdating } = useResource(fieldType.name);

  const {
    editingItem: editingEnum,
    itemToDelete: enumToDelete,
    isEditingLocked,
    startEditing: setEditingEnum,
    cancelEditing,
    setItemToDelete: setEnumToDelete,
    clearItemToDelete,
  } = useListItemEditing<EnumDefinition>();

  const {
    control: newEnumControl,
    handleSubmit: handleNewSubmit,
    reset: resetNewEnum,
  } = useForm<NewEnumDraft>({
    defaultValues: {
      enumValue: '',
      enumDisplayValue: '',
      enumDescription: '',
    },
  });

  const {
    control: editEnumControl,
    reset: resetEditEnum,
    handleSubmit: handleEditSubmit,
  } = useForm<EditEnumDraft>({
    defaultValues: {
      enumValue: '',
      enumDisplayValue: '',
      enumDescription: '',
    },
  });

  const newEnumValues = useWatch({ control: newEnumControl });

  // Hide the editor if the data type doesn't support enum values
  if (!ENUM_DATA_TYPES.includes(fieldType.dataType)) {
    return null;
  }

  const enumValues = fieldType.enumValues || [];
  const busy = isUpdating();
  const disableAll = readOnly || busy;

  const existingEnumValues = new Set(enumValues.map((e) => e.enumValue));
  const newEnumValue = newEnumValues.enumValue ?? '';
  const isValueUnique = !newEnumValue || !existingEnumValues.has(newEnumValue);

  const handleAddEnum = async (data: NewEnumDraft) => {
    if (!data.enumValue.trim() || disableAll || !isValueUnique) return;

    try {
      const newEnum: EnumDefinition = {
        enumValue: data.enumValue.trim(),
      };
      if (data.enumDisplayValue.trim()) {
        newEnum.enumDisplayValue = data.enumDisplayValue.trim();
      }
      if (data.enumDescription.trim()) {
        newEnum.enumDescription = data.enumDescription.trim();
      }

      await update({
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'add',
          target: newEnum,
        },
      });

      dispatch(
        addNotification({
          message: t('enumValueAdded'),
          type: 'success',
        }),
      );
      resetNewEnum({
        enumValue: '',
        enumDisplayValue: '',
        enumDescription: '',
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

  const handleDeleteEnum = async (enumDef: EnumDefinition) => {
    if (disableAll) return;
    try {
      await update({
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'remove',
          target: { enumValue: enumDef.enumValue },
        },
      });
      dispatch(
        addNotification({
          message: t('enumValueDeleted'),
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

  const closeEditMode = () => {
    cancelEditing();
    resetEditEnum({
      enumValue: '',
      enumDisplayValue: '',
      enumDescription: '',
    });
  };

  const handleSaveEdit = async (
    originalEnum: EnumDefinition,
    draft: EditEnumDraft,
  ) => {
    if (!draft || disableAll) return;

    // Check if the new enumValue already exists (and is different from original)
    if (
      draft.enumValue !== originalEnum.enumValue &&
      existingEnumValues.has(draft.enumValue)
    ) {
      dispatch(
        addNotification({
          message: t('enumValueExists'),
          type: 'error',
        }),
      );
      return;
    }

    const updatedEnum: EnumDefinition = {
      enumValue: draft.enumValue.trim(),
    };
    if (draft.enumDisplayValue.trim()) {
      updatedEnum.enumDisplayValue = draft.enumDisplayValue.trim();
    }
    if (draft.enumDescription.trim()) {
      updatedEnum.enumDescription = draft.enumDescription.trim();
    }

    // Check if anything actually changed
    const hasChanges =
      updatedEnum.enumValue !== originalEnum.enumValue ||
      (updatedEnum.enumDisplayValue ?? '') !==
        (originalEnum.enumDisplayValue ?? '') ||
      (updatedEnum.enumDescription ?? '') !==
        (originalEnum.enumDescription ?? '');

    if (!hasChanges) {
      closeEditMode();
      return;
    }

    try {
      await update({
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'change',
          target: { enumValue: originalEnum.enumValue },
          to: updatedEnum,
        },
      });
      dispatch(
        addNotification({
          message: t('enumValueUpdated'),
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

  const handleMove = async (
    enumDef: EnumDefinition,
    direction: 'up' | 'down',
  ) => {
    if (disableAll) return;

    const currentIndex = enumValues.findIndex(
      (e) => e.enumValue === enumDef.enumValue,
    );
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= enumValues.length) return;

    try {
      await update({
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'rank',
          target: enumDef,
          newIndex: targetIndex,
        },
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

  const startEditing = (enumDef: EnumDefinition) => {
    setEditingEnum(enumDef.enumValue);
    resetEditEnum({
      enumValue: enumDef.enumValue,
      enumDisplayValue: enumDef.enumDisplayValue || '',
      enumDescription: enumDef.enumDescription || '',
    });
  };

  const renderEnumRow = (
    enumDef: EnumDefinition,
    index: number,
    total: number,
  ) => {
    const isEditing = editingEnum === enumDef.enumValue;
    const lockedByOtherEdit = editingEnum !== null && !isEditing;
    const rowDisabled = disableAll || lockedByOtherEdit;

    const canMoveUp = index > 0;
    const canMoveDown = index < total - 1;

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !rowDisabled) {
        e.preventDefault();
        void handleEditSubmit((data) => handleSaveEdit(enumDef, data))();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEditMode();
      }
    };

    return (
      <Sheet key={enumDef.enumValue} variant="outlined" sx={listRowStyles}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Stack spacing={-0.5} sx={reorderButtonContainerStyles}>
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              disabled={rowDisabled || !canMoveUp}
              onClick={() => handleMove(enumDef, 'up')}
              title={t('moveUp')}
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              disabled={rowDisabled || !canMoveDown}
              onClick={() => handleMove(enumDef, 'down')}
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
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    level="body-xs"
                    fontWeight="lg"
                    textColor="text.primary"
                  >
                    {t('value')}
                  </Typography>
                  <Controller
                    name="enumValue"
                    control={editEnumControl}
                    rules={{ required: true }}
                    render={({ field: ctrl }) => (
                      <Input
                        size="sm"
                        placeholder={t('value')}
                        value={ctrl.value ?? ''}
                        onChange={ctrl.onChange}
                        disabled={rowDisabled}
                        onKeyDown={handleKeyDown}
                      />
                    )}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    level="body-xs"
                    fontWeight="lg"
                    textColor="text.primary"
                  >
                    {t('displayName')}
                  </Typography>
                  <Controller
                    name="enumDisplayValue"
                    control={editEnumControl}
                    render={({ field: ctrl }) => (
                      <Input
                        size="sm"
                        placeholder={t('displayName')}
                        value={ctrl.value ?? ''}
                        onChange={ctrl.onChange}
                        disabled={rowDisabled}
                        onKeyDown={handleKeyDown}
                      />
                    )}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    level="body-xs"
                    fontWeight="lg"
                    textColor="text.primary"
                  >
                    {t('description')}
                  </Typography>
                  <Controller
                    name="enumDescription"
                    control={editEnumControl}
                    render={({ field: ctrl }) => (
                      <Input
                        size="sm"
                        placeholder={t('description')}
                        value={ctrl.value ?? ''}
                        onChange={ctrl.onChange}
                        disabled={rowDisabled}
                        onKeyDown={handleKeyDown}
                      />
                    )}
                  />
                </Box>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box flex={1}>
                  <Typography
                    level="body-xs"
                    fontWeight="lg"
                    textColor="text.primary"
                  >
                    {t('value')}
                  </Typography>
                  <Typography level="body-xs" textColor="text.primary">
                    {enumDef.enumValue}
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
                  <Typography level="body-xs" textColor="text.primary">
                    {enumDef.enumDisplayValue || '-'}
                  </Typography>
                </Box>
                <Box flex={1}>
                  <Typography
                    level="body-xs"
                    fontWeight="lg"
                    textColor="text.primary"
                  >
                    {t('description')}
                  </Typography>
                  <Typography level="body-xs" textColor="text.primary">
                    {enumDef.enumDescription || '-'}
                  </Typography>
                </Box>
              </Stack>
            )}
          </Stack>

          <EditableRowActions
            isEditing={isEditing}
            disabled={rowDisabled}
            onEdit={() => startEditing(enumDef)}
            onDelete={() => setEnumToDelete(enumDef)}
            onSave={() =>
              void handleEditSubmit((data) => handleSaveEdit(enumDef, data))()
            }
            onCancel={closeEditMode}
          />
        </Stack>
      </Sheet>
    );
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography level="h4" sx={{ mb: 2 }}>
          {t('enumValues')}
        </Typography>
        <Stack spacing={1.25}>
          <FormControl>
            <FormLabel>{t('value')} *</FormLabel>
            <Controller
              control={newEnumControl}
              name="enumValue"
              rules={{ required: true }}
              render={({ field }) => (
                <Input
                  size="sm"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disableAll || isEditingLocked}
                  error={!isValueUnique}
                  placeholder={t('enumValuePlaceholder')}
                />
              )}
            />
            {!isValueUnique && (
              <Typography level="body-xs" color="danger">
                {t('enumValueExists')}
              </Typography>
            )}
          </FormControl>

          <FormControl>
            <FormLabel>{t('displayName')}</FormLabel>
            <Controller
              control={newEnumControl}
              name="enumDisplayValue"
              render={({ field }) => (
                <Input
                  size="sm"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disableAll || isEditingLocked}
                  placeholder={t('enumDisplayValuePlaceholder')}
                />
              )}
            />
          </FormControl>

          <FormControl>
            <FormLabel>{t('description')}</FormLabel>
            <Controller
              control={newEnumControl}
              name="enumDescription"
              render={({ field }) => (
                <Input
                  size="sm"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disableAll || isEditingLocked}
                  placeholder={t('enumDescriptionPlaceholder')}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !disableAll &&
                      !isEditingLocked &&
                      newEnumValue.trim() &&
                      isValueUnique
                    ) {
                      e.preventDefault();
                      void handleNewSubmit(handleAddEnum)();
                    }
                  }}
                />
              )}
            />
          </FormControl>

          <Button
            variant="solid"
            size="sm"
            sx={{ alignSelf: 'stretch' }}
            onClick={() => void handleNewSubmit(handleAddEnum)()}
            disabled={
              disableAll ||
              isEditingLocked ||
              !newEnumValue.trim() ||
              !isValueUnique
            }
          >
            {t('add')}
          </Button>
        </Stack>
      </Box>

      <Stack spacing={1}>
        {enumValues.length === 0 ? (
          <Typography level="body-sm" color="neutral">
            {t('noEnumValues')}
          </Typography>
        ) : (
          enumValues.map((enumDef, index) =>
            renderEnumRow(enumDef, index, enumValues.length),
          )
        )}
      </Stack>

      <GenericConfirmModal
        open={enumToDelete !== null}
        onClose={clearItemToDelete}
        onConfirm={async () => {
          if (enumToDelete) {
            await handleDeleteEnum(enumToDelete);
          }
          clearItemToDelete();
        }}
        title={t('deleteEnumValue')}
        content={t('deleteEnumValueConfirm', {
          value: enumToDelete?.enumValue,
        })}
        confirmText={t('delete')}
      />
    </Stack>
  );
}

export default EnumValuesEditor;
