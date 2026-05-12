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

import type { KeyboardEvent } from 'react';
import { useEffect } from 'react';
import { Accordion, AccordionDetails, Box, IconButton, Stack } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Controller, useForm } from 'react-hook-form';
import type { DataType, MetadataValue } from '@/lib/definitions';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import EditableField, { FieldLabel } from '@/components/EditableField';
import FieldEditor from '@/components/FieldEditor';

export interface FieldRowProps {
  id?: string;
  expanded?: boolean;
  value: MetadataValue | null | undefined;
  label: string;
  dataType: DataType | 'label';
  description?: string;
  enumValues?: EnumDefinition[];
  isEditing?: boolean;
  disabled?: boolean;
  onStartEdit?: () => void;
  onSave?: (value: MetadataValue) => void;
  onAutoSave?: (value: MetadataValue) => void;
  onCancel?: () => void;
}

function coerceValue(
  rawValue: string | string[] | null,
  dataType: DataType | 'label',
): MetadataValue {
  switch (dataType) {
    case 'number':
    case 'integer':
      return rawValue ? parseFloat(rawValue as string) : null;
    case 'boolean':
      return rawValue === 'true' ? true : rawValue === 'false' ? false : null;
    case 'list':
      return Array.isArray(rawValue) ? rawValue : [];
    case 'shortText':
    case 'longText':
    case 'date':
    case 'dateTime':
    case 'person':
    case 'enum':
      return rawValue === '' ? null : rawValue;
    default:
      return rawValue;
  }
}

export function FieldRow({
  id,
  expanded,
  value,
  label,
  dataType,
  description,
  enumValues,
  isEditing,
  disabled,
  onStartEdit,
  onSave,
  onAutoSave,
  onCancel,
}: FieldRowProps) {
  const initialValue = value ?? null;

  const {
    control,
    reset,
    getValues,
    formState: { isDirty },
  } = useForm({ defaultValues: { value: initialValue } });

  const serializedInitial = JSON.stringify(initialValue);
  useEffect(() => {
    reset({ value: initialValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedInitial, reset, isEditing]);

  const handleChange = (
    rawValue: string | string[] | null,
    onChange: (v: MetadataValue) => void,
  ) => {
    const coerced = coerceValue(rawValue, dataType);
    onChange(coerced);
    onAutoSave?.(coerced);
  };

  const handleSave = () => {
    onSave?.(getValues('value'));
  };

  const handleCancel = () => {
    reset({ value: initialValue });
    onCancel?.();
  };

  const handleKeyDownCapture = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && onSave && isDirty) {
      // For multiline fields, require Ctrl/Cmd+Enter to save
      if (dataType === 'longText' && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      handleSave();
    }
  };

  const isClickable = !disabled && !isEditing && !!onStartEdit;

  return (
    <Accordion
      id={id}
      expanded={expanded}
      sx={{
        borderLeft: '3px solid',
        borderColor: isEditing ? 'primary.300' : 'neutral.300',
        paddingX: 0.5,
        marginY: expanded ? 0.5 : 0,
        ...(isClickable && {
          cursor: 'pointer',
          '&:hover': {
            borderColor: 'primary.200',
            backgroundColor: 'background.level1',
          },
        }),
      }}
    >
      <AccordionDetails>
        {isEditing ? (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 0.5, md: 4 }}
            onKeyDownCapture={handleKeyDownCapture}
            onKeyDown={handleKeyDown}
          >
            <FieldLabel
              label={label}
              description={description}
              disabled={disabled}
              edit={true}
            />
            <Stack
              direction="row"
              alignItems="flex-start"
              spacing={0.5}
              sx={{
                flexGrow: 1,
                width: { xs: '100%', md: 'auto' },
                minWidth: 0,
              }}
            >
              <Box flexGrow={1} minWidth={0}>
                <Controller
                  name="value"
                  control={control}
                  render={({ field: { value: formValue, onChange } }) => (
                    <FieldEditor
                      value={formValue}
                      onChange={(e: string | string[] | null) =>
                        handleChange(e, onChange)
                      }
                      dataType={dataType}
                      enumValues={enumValues}
                      disabled={disabled}
                      focus={true}
                    />
                  )}
                />
              </Box>
              {onSave && (
                <IconButton
                  data-cy="fieldSaveButton"
                  size="sm"
                  variant="soft"
                  color="primary"
                  disabled={!isDirty}
                  onClick={handleSave}
                >
                  <CheckIcon />
                </IconButton>
              )}
              <IconButton
                data-cy="fieldCancelButton"
                size="sm"
                variant="soft"
                color="neutral"
                onClick={handleCancel}
              >
                <CloseIcon />
              </IconButton>
            </Stack>
          </Stack>
        ) : (
          <Box
            onClick={isClickable ? onStartEdit : undefined}
            data-cy="editableFieldRow"
          >
            <EditableField
              value={value ?? ''}
              label={label}
              dataType={dataType}
              description={description}
              enumValues={enumValues}
              edit={false}
              disabled={disabled}
            />
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
