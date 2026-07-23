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

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
} from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Controller, useForm } from 'react-hook-form';
import type { DataType, MetadataValue } from '@/lib/definitions';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import EditableField, { FieldLabel } from '@/components/EditableField';
import FieldEditor from '@/components/FieldEditor';
import { coerceMetadataValue, metadataValueToString } from '@/lib/utils';
import { formKeyHandler } from '@/lib/hooks';

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
  /** True for a calculated field that can be overridden by the user. */
  overrideMode?: boolean;
  /** The computed value shown on the "Automatic value" line, when `overrideMode`. */
  calculatedValue?: MetadataValue;
  onStartEdit?: () => void;
  onSave?: (value: MetadataValue) => void;
  onAutoSave?: (value: MetadataValue) => void;
  onCancel?: () => void;
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
  overrideMode,
  calculatedValue,
  onStartEdit,
  onSave,
  onAutoSave,
  onCancel,
}: FieldRowProps) {
  const { t } = useTranslation();
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
    const coerced = coerceMetadataValue(rawValue, dataType);
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

  const isClickable = !disabled && !isEditing && !!onStartEdit;

  // Overridable fields are always of a "normal" dataType, never 'label'.
  const formatValue = (v: MetadataValue) =>
    metadataValueToString(v ?? null, dataType as DataType, t, enumValues);

  const automaticValueLine = overrideMode ? (
    <Typography level="body-xs" data-cy="automaticValue">
      {t('automaticValue')}:{' '}
      <Typography component="span" fontWeight="bold" color="neutral">
        {formatValue(calculatedValue ?? null)}
      </Typography>
    </Typography>
  ) : null;

  const editorField = (
    <Controller
      name="value"
      control={control}
      render={({ field: { value: formValue, onChange } }) => (
        <FieldEditor
          value={formValue}
          onChange={(e: string | string[] | null) => handleChange(e, onChange)}
          dataType={dataType}
          enumValues={enumValues}
          disabled={disabled}
          focus={true}
        />
      )}
    />
  );

  const saveCancelButtons = (
    <>
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
    </>
  );

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
            onKeyDown={formKeyHandler({
              canSubmit: !!onSave && isDirty,
              onSubmit: handleSave,
              onCancel: handleCancel,
              multiline: dataType === 'longText' || dataType === 'label',
            })}
          >
            <FieldLabel
              label={label}
              description={description}
              disabled={disabled}
              edit={true}
            />
            {overrideMode ? (
              <Stack
                spacing={0.5}
                sx={{
                  flexGrow: 1,
                  width: { xs: '100%', md: 'auto' },
                  minWidth: 0,
                }}
              >
                {automaticValueLine}
                <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                  <Typography
                    level="body-xs"
                    sx={{ flexShrink: 0, alignSelf: 'center' }}
                  >
                    {t('override')}:
                  </Typography>
                  <Box flexGrow={1} minWidth={0}>
                    {editorField}
                  </Box>
                  <Button
                    data-cy="fieldClearOverrideButton"
                    size="sm"
                    variant="plain"
                    color="neutral"
                    disabled={disabled || (initialValue === null && !isDirty)}
                    onClick={() => onSave?.(null)}
                  >
                    {t('clearOverride')}
                  </Button>
                  {saveCancelButtons}
                </Stack>
              </Stack>
            ) : (
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
                  {editorField}
                </Box>
                {saveCancelButtons}
              </Stack>
            )}
          </Stack>
        ) : overrideMode ? (
          <Box
            onClick={isClickable ? onStartEdit : undefined}
            data-cy="editableFieldRow"
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 0.5, md: 4 }}
            >
              <FieldLabel
                label={label}
                description={description}
                disabled={disabled}
                edit={false}
              />
              <Stack spacing={0.5}>
                {automaticValueLine}
                <Typography level="body-xs" data-cy="overrideValue">
                  {t('override')}:{' '}
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color={disabled ? 'neutral' : 'primary'}
                  >
                    {formatValue(value ?? null)}
                  </Typography>
                </Typography>
              </Stack>
            </Stack>
          </Box>
        ) : (
          <Box
            onClick={isClickable ? onStartEdit : undefined}
            data-cy="editableFieldRow"
          >
            <EditableField
              value={value ?? null}
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
