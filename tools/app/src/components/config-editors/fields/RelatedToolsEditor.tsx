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
  Input,
  Stack,
  Typography,
} from '@mui/joy';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useResource } from '@/lib/api';
import { useAppDispatch, useListItemEditing } from '@/lib/hooks';
import { formKeyHandler, useKeyboardShortcut } from '@/lib/hooks/utils';
import { addNotification } from '@/lib/slices/notifications';
import { GenericConfirmModal } from '@/components/modals';
import { EditableRowActions } from './EditableRowActions';
import { ListRow } from './ListRow';
import type { Skill } from '@cyberismo/data-handler/interfaces/resource-interfaces';

type ToolDraft = { tool: string };

const emptyDraft: ToolDraft = { tool: '' };

/**
 * Editor for a skill's 'relatedTools' — the MCP tool names its instructions
 * use. Tool names are free-form strings, so this is a plain list editor.
 *
 * Like the other list editors, each change is saved immediately instead of
 * going through a FieldRow: FieldRow installs a global Enter shortcut and a
 * save-on-blur handler, which would fight the add and edit inputs here.
 */
export function RelatedToolsEditor({
  skill,
  readOnly,
}: {
  skill: Skill;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { update, isUpdating } = useResource(skill.name);

  const {
    editingItem: editingTool,
    itemToDelete: toolToDelete,
    isEditingLocked,
    startEditing: setEditingTool,
    cancelEditing,
    setItemToDelete: setToolToDelete,
    clearItemToDelete,
  } = useListItemEditing<string>();

  const {
    control: newToolControl,
    handleSubmit: handleNewSubmit,
    reset: resetNewTool,
  } = useForm<ToolDraft>({ defaultValues: emptyDraft });

  const {
    control: editToolControl,
    handleSubmit: handleEditSubmit,
    reset: resetEditTool,
  } = useForm<ToolDraft>({ defaultValues: emptyDraft });

  const newToolValues = useWatch({ control: newToolControl });

  const closeEditMode = () => {
    cancelEditing();
    resetEditTool(emptyDraft);
  };

  // Allow cancelling edit mode with Escape even when not focused on an input
  useKeyboardShortcut({ key: 'Escape' }, () => {
    if (editingTool !== null) {
      closeEditMode();
    }
  });

  const relatedTools = skill.relatedTools || [];
  const disableAll = readOnly || isUpdating();

  const existingTools = new Set(relatedTools);
  const newTool = (newToolValues.tool ?? '').trim();
  const isNewToolUnique = !newTool || !existingTools.has(newTool);
  const canAddTool =
    !disableAll && !isEditingLocked && !!newTool && isNewToolUnique;

  const notifyError = (error: unknown) =>
    dispatch(
      addNotification({
        message:
          error instanceof Error ? error.message : (t('unknownError') ?? ''),
        type: 'error',
      }),
    );

  const handleAddTool = async (data: ToolDraft) => {
    if (disableAll || !isNewToolUnique) return;
    try {
      await update({
        updateKey: { key: 'relatedTools' },
        operation: { name: 'add', target: data.tool.trim() },
      });
      dispatch(
        addNotification({ message: t('relatedToolAdded'), type: 'success' }),
      );
      resetNewTool(emptyDraft);
    } catch (error) {
      notifyError(error);
    }
  };

  const handleDeleteTool = async (tool: string) => {
    if (disableAll) return;
    try {
      await update({
        updateKey: { key: 'relatedTools' },
        operation: { name: 'remove', target: tool },
      });
      dispatch(
        addNotification({ message: t('relatedToolDeleted'), type: 'success' }),
      );
    } catch (error) {
      notifyError(error);
    }
  };

  const handleSaveEdit = async (originalTool: string, draft: ToolDraft) => {
    if (disableAll) return;

    const updatedTool = draft.tool.trim();
    if (!updatedTool || updatedTool === originalTool) {
      closeEditMode();
      return;
    }
    if (existingTools.has(updatedTool)) {
      dispatch(
        addNotification({ message: t('relatedToolExists'), type: 'error' }),
      );
      return;
    }

    try {
      await update({
        updateKey: { key: 'relatedTools' },
        operation: { name: 'change', target: originalTool, to: updatedTool },
      });
      dispatch(
        addNotification({ message: t('relatedToolUpdated'), type: 'success' }),
      );
      closeEditMode();
    } catch (error) {
      notifyError(error);
    }
  };

  const startEditing = (tool: string) => {
    setEditingTool(tool);
    resetEditTool({ tool });
  };

  const renderToolRow = (tool: string) => {
    const isEditing = editingTool === tool;
    const rowDisabled = disableAll || (editingTool !== null && !isEditing);

    const handleRowKeyDown = formKeyHandler({
      canSubmit: !rowDisabled,
      onSubmit: () => handleEditSubmit((data) => handleSaveEdit(tool, data))(),
      onCancel: closeEditMode,
    });

    return (
      <ListRow key={tool}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <Controller
                name="tool"
                control={editToolControl}
                rules={{ required: true }}
                render={({ field: ctrl }) => (
                  <Input
                    size="sm"
                    placeholder={t('relatedToolPlaceholder')}
                    value={ctrl.value ?? ''}
                    onChange={ctrl.onChange}
                    disabled={rowDisabled}
                    onKeyDown={handleRowKeyDown}
                  />
                )}
              />
            ) : (
              <Typography level="body-xs" textColor="text.primary">
                {tool}
              </Typography>
            )}
          </Box>

          <EditableRowActions
            isEditing={isEditing}
            disabled={rowDisabled}
            onEdit={() => startEditing(tool)}
            onDelete={() => setToolToDelete(tool)}
            onSave={() =>
              void handleEditSubmit((data) => handleSaveEdit(tool, data))()
            }
            onCancel={closeEditMode}
          />
        </Stack>
      </ListRow>
    );
  };

  return (
    <Stack spacing={7}>
      <Box>
        <Typography level="h4" sx={{ mb: 4 }}>
          {t('relatedTools')}
        </Typography>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canAddTool) {
              void handleNewSubmit(handleAddTool)();
            }
          }}
        >
          <Stack spacing={1.25}>
            <FormControl>
              <FormLabel>{t('relatedTool')} *</FormLabel>
              <Controller
                control={newToolControl}
                name="tool"
                rules={{ required: true }}
                render={({ field }) => (
                  <Input
                    size="sm"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={disableAll || isEditingLocked}
                    error={!isNewToolUnique}
                    placeholder={t('relatedToolPlaceholder')}
                  />
                )}
              />
              {!isNewToolUnique && (
                <Typography level="body-xs" color="danger">
                  {t('relatedToolExists')}
                </Typography>
              )}
            </FormControl>

            <Button
              type="submit"
              variant="solid"
              size="sm"
              sx={{ alignSelf: 'stretch' }}
              disabled={!canAddTool}
            >
              {t('add')}
            </Button>
          </Stack>
        </form>
      </Box>

      <Stack spacing={1}>
        {relatedTools.length === 0 ? (
          <Typography level="body-sm" color="neutral">
            {t('noRelatedTools')}
          </Typography>
        ) : (
          relatedTools.map((tool) => renderToolRow(tool))
        )}
      </Stack>

      <GenericConfirmModal
        open={toolToDelete !== null}
        onClose={clearItemToDelete}
        onConfirm={async () => {
          if (toolToDelete) {
            await handleDeleteTool(toolToDelete);
          }
          clearItemToDelete();
        }}
        title={t('deleteRelatedTool')}
        content={t('deleteRelatedToolConfirm', { value: toolToDelete })}
        confirmText={t('delete')}
      />
    </Stack>
  );
}

export default RelatedToolsEditor;
