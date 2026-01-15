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
            disabled={disabled}
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
