// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { IconButton, Stack } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

interface EditableRowActionsProps {
  isEditing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditableRowActions({
  isEditing,
  disabled,
  onEdit,
  onDelete,
  onSave,
  onCancel,
}: EditableRowActionsProps) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
      {isEditing ? (
        <>
          <IconButton
            size="sm"
            color="success"
            variant="solid"
            disabled={disabled}
            onClick={onSave}
          >
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="sm"
            color="neutral"
            variant="plain"
            onClick={onCancel}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      ) : (
        <>
          <IconButton
            size="sm"
            color="primary"
            variant="solid"
            disabled={disabled}
            onClick={onEdit}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="sm"
            color="danger"
            variant="outlined"
            disabled={disabled}
            onClick={onDelete}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Stack>
  );
}
