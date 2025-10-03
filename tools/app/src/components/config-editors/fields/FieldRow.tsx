/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Stack, IconButton } from '@mui/joy';
import { cloneElement, ReactElement } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import type { BaseInputProps } from './types';
import { useKeyboardShortcut } from '@/lib/hooks';

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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && dirty) {
      // require ctrl key for textarea so that new lines can be created
      const isTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA';
      if (!isTextarea || e.ctrlKey) {
        e.preventDefault();
        void onSave();
      }
    } else if (e.key === 'Escape' && dirty) {
      e.preventDefault();
      onCancel();
    }
  };

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
