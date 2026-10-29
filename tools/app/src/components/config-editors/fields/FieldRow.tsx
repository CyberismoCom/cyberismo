// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Stack, IconButton } from '@mui/joy';
import { cloneElement, type ReactElement } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import type { BaseInputProps } from './types';
import { useKeyboardShortcut, formKeyHandler } from '@/lib/hooks';

export function FieldRow({
  dirty,
  onSave,
  onCancel,
  children,
}: {
  dirty: boolean;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  children: ReactElement<BaseInputProps> | null;
}) {
  const handleKeyDown = formKeyHandler({
    canSubmit: dirty,
    onSubmit: onSave,
    onCancel,
  });

  const handleBlur = () => {
    if (dirty) {
      void onSave();
    }
  };
  useKeyboardShortcut({ key: 'enter' }, () => {
    if (dirty) {
      void onSave();
    }
  });
  useKeyboardShortcut({ key: 'escape' }, () => {
    if (dirty) {
      onCancel();
    }
  });

  const childWithKeyboardHandlers = children
    ? cloneElement(children, {
        onKeyDown: handleKeyDown,
        onBlur: handleBlur,
      })
    : null;
  return (
    <Stack direction="column" spacing={0.5}>
      {childWithKeyboardHandlers}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          visibility: dirty ? 'visible' : 'hidden',
          alignSelf: 'flex-end',
        }}
      >
        <IconButton
          size="sm"
          variant="plain"
          color="success"
          onClick={() => void onSave()}
          onMouseDown={(e) => e.preventDefault()} // Prevent blur
          sx={{
            '&:hover': {
              backgroundColor: 'success.softHoverBg',
            },
          }}
        >
          <CheckIcon sx={{ fontSize: '16px' }} />
        </IconButton>
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={onCancel}
          onMouseDown={(e) => e.preventDefault()} // Prevent blur
          sx={{
            '&:hover': {
              backgroundColor: 'neutral.softHoverBg',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: '16px' }} />
        </IconButton>
      </Stack>
    </Stack>
  );
}

export default FieldRow;
