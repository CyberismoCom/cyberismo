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

import { useEffect, useRef } from 'react';
import type { FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionDetails, Box, IconButton, Stack } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Controller, useForm } from 'react-hook-form';
import type { DataType, MetadataValue } from '@/lib/definitions';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import EditableField, { FieldLabel } from '@/components/EditableField';
import FieldEditor from '@/components/FieldEditor';
import { OverrideEditorFrame, OverriddenMarker } from './OverrideEditorFrame';
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
  /** The stored override, edited when `overrideMode`. `value` stays the effective value. */
  overrideValue?: MetadataValue;
  /** The computed value shown on the "Calculated value" line while editing, when `overrideMode`. */
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
  overrideValue,
  calculatedValue,
  onStartEdit,
  onSave,
  onAutoSave,
  onCancel,
}: FieldRowProps) {
  const { t } = useTranslation();
  const initialValue = (overrideMode ? overrideValue : value) ?? null;
  const isOverridden = !!overrideMode && overrideValue != null;

  // Overridable fields are always of a "normal" dataType, never 'label'.
  const formatValue = (v: MetadataValue) =>
    metadataValueToString(v ?? null, dataType as DataType, t, enumValues);

  const {
    control,
    reset,
    getValues,
    formState: { isDirty },
  } = useForm({ defaultValues: { value: initialValue } });

  // Reseed the form only when a field is freshly opened for editing (the
  // rising edge of `isEditing`) — not on every change, and specifically not
  // when it is closed by the parent switching `editingFieldKey` to a
  // different field. Resetting unconditionally there would silently wipe an
  // in-flight, not-yet-saved draft out from under the onBlur-triggered save
  // below.
  const serializedInitial = JSON.stringify(initialValue);
  /** The editing row, used to tell "focus left the editor" from "focus moved to this row's own buttons". */
  const rowRef = useRef<HTMLDivElement>(null);
  const wasEditingRef = useRef(isEditing);
  useEffect(() => {
    const enteringEdit = isEditing && !wasEditingRef.current;
    wasEditingRef.current = isEditing;
    if (enteringEdit) {
      reset({ value: initialValue });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, serializedInitial, reset]);

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

  const isValueDirty = () =>
    JSON.stringify(getValues('value')) !== serializedInitial;

  const handleBlur = (event: FocusEvent) => {
    if (!isDirty) {
      return;
    }
    const next = event.relatedTarget as HTMLElement | null;
    if (next && rowRef.current?.contains(next)) {
      // Focus moved to this row's own controls (Save, Cancel, Clear). That
      // button decides the outcome, so do not pre-empt it with a save. Scoped
      // to this row deliberately: focus landing on any *other* button in the
      // app is a genuine "leaving the editor" and must still save.
      return;
    }
    if (next?.closest('[role="listbox"]')) {
      // A Select moves focus into its portalled listbox while open, so the
      // field is still being edited. `handleCommit` saves once it closes.
      return;
    }
    handleSave();
  };

  // A Select's listbox has closed: interaction with the dropdown is over.
  // Reads the live form value rather than `isDirty`, because the closing
  // option click updates the value in the same tick as this callback.
  const handleCommit = () => {
    if (isValueDirty()) {
      handleSave();
    }
  };

  const handleCancel = () => {
    reset({ value: initialValue });
    onCancel?.();
  };

  const isClickable = !disabled && !isEditing && !!onStartEdit;

  const editorField = (
    <Controller
      name="value"
      control={control}
      render={({ field: { value: formValue, onChange } }) => (
        <FieldEditor
          value={formValue}
          onChange={(e: string | string[] | null) => handleChange(e, onChange)}
          onBlur={handleBlur}
          onCommit={handleCommit}
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
          onMouseDown={(e) => e.preventDefault()}
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
        onMouseDown={(e) => e.preventDefault()}
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
            ref={rowRef}
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
              <OverrideEditorFrame
                calculatedValue={formatValue(calculatedValue ?? null)}
                editor={editorField}
                clearDisabled={disabled || (initialValue === null && !isDirty)}
                onClear={() => onSave?.(null)}
                actions={saveCancelButtons}
              />
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
              valueDecorator={
                isOverridden ? (
                  <OverriddenMarker
                    calculatedValue={formatValue(calculatedValue ?? null)}
                  />
                ) : undefined
              }
            />
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
