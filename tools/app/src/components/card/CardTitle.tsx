/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Stack, Textarea, Typography } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';

import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { isEdited } from '@/lib/slices/pageState';
import { getConfig } from '@/lib/utils';
import type { MetadataValue } from '@/lib/definitions';

type CardTitleProps = {
  title: string;
  disabled?: boolean;
  preview?: boolean;
  onSave?: (update: {
    metadata: Record<string, MetadataValue>;
  }) => Promise<void>;
};

export const CardTitle: React.FC<CardTitleProps> = ({
  title,
  disabled,
  preview,
  onSave,
}) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const editBoxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = !preview && !!onSave && !disabled && !getConfig().staticMode;

  const handleStartEdit = (e: React.MouseEvent) => {
    if (!canEdit) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea, [role="button"]'))
      return;
    setValue(title);
    setEditing(true);
  };

  const handleEditButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    setValue(title);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    const next = value.trim();
    if (next === title) {
      setEditing(false);
      dispatch(isEdited(false));
      return;
    }
    if (next === '') {
      return;
    }
    try {
      await onSave({ metadata: { title: next } });
      setEditing(false);
      dispatch(isEdited(false));
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : '',
          type: 'error',
        }),
      );
    }
  };

  const handleCancel = () => {
    setValue(title);
    setEditing(false);
    dispatch(isEdited(false));
  };

  useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 's' || e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };
    const handleClickAway = (e: MouseEvent) => {
      if (
        editBoxRef.current &&
        !editBoxRef.current.contains(e.target as Node)
      ) {
        handleCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleClickAway);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, value, title, onSave]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editing]);

  if (editing) {
    return (
      <Box
        ref={editBoxRef}
        data-cy="cardTitleEditor"
        border="1px solid"
        borderColor="primary.outlinedBorder"
        borderRadius={6}
        padding={1.5}
      >
        <Stack spacing={1}>
          <Textarea
            slotProps={{
              textarea: { ref: textareaRef, 'data-cy': 'cardTitleInput' },
            }}
            variant="plain"
            value={value}
            minRows={1}
            maxRows={3}
            onChange={(e) => {
              setValue(e.target.value);
              dispatch(isEdited(true));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
            sx={{
              fontWeight: 'bold',
              fontSize: '1.8rem',
              padding: 0,
              '--Textarea-focusedThickness': '0',
              '& textarea': { lineHeight: 1.2 },
            }}
          />
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              data-cy="cardTitleCancelButton"
              onClick={handleCancel}
            >
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              variant="soft"
              color="primary"
              data-cy="cardTitleSaveButton"
              startDecorator={<EditIcon />}
              onClick={handleSave}
            >
              {t('save')}
            </Button>
          </Stack>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      data-cy="cardTitle"
      border="1px solid"
      borderColor="transparent"
      borderRadius={6}
      padding={1.5}
      position="relative"
      onClick={handleStartEdit}
      sx={
        canEdit
          ? {
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.outlinedBorder',
              },
              '&:hover .edit-icon-button': {
                opacity: 1,
              },
            }
          : undefined
      }
    >
      {canEdit && (
        <IconButton
          className="edit-icon-button"
          data-cy="cardTitleEditButton"
          size="sm"
          variant="soft"
          color="primary"
          onClick={handleEditButtonClick}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            opacity: 0,
            transition: 'opacity 0.15s',
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      )}
      <Typography level="h1">{title}</Typography>
    </Box>
  );
};
