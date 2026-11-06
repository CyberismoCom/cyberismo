// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from 'react';
import type { FocusEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { MetadataValue } from '@/lib/definitions';
import type { FieldRowData } from './customFieldRow';
import FieldEditor from '@/components/FieldEditor';
import { coerceMetadataValue } from '@/lib/utils';
import { focusLeftEditor, formKeyHandler } from '@/lib/hooks';

interface FieldEditFormOptions {
  row: Pick<
    FieldRowData,
    'value' | 'overrideMode' | 'overrideValue' | 'dataType' | 'enumValues'
  >;
  isEditing?: boolean;
  disabled?: boolean;
  /** Names the editor when its label is not visible. */
  ariaLabel?: string;
  onSave?: (value: MetadataValue) => void;
  onAutoSave?: (value: MetadataValue) => void;
  onCancel?: () => void;
}

/** The edit form of one field: draft state, coercion, save and cancel, keys. */
export function useFieldEditForm({
  row,
  isEditing,
  disabled,
  ariaLabel,
  onSave,
  onAutoSave,
  onCancel,
}: FieldEditFormOptions) {
  const { dataType, enumValues, overrideMode } = row;
  // An overridable field edits its stored override, not the effective value.
  const initialValue = (overrideMode ? row.overrideValue : row.value) ?? null;
  const {
    control,
    reset,
    getValues,
    formState: { isDirty },
  } = useForm({ defaultValues: { value: initialValue } });

  // Reseed only when editing opens (rising edge). Resetting when the parent
  // closes the row would wipe a draft before the blur-triggered save reads it.
  const serializedInitial = JSON.stringify(initialValue);
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
    if (focusLeftEditor(event, rowRef.current)) {
      handleSave();
    }
  };

  // Reads the live value rather than `isDirty`: the option click that closes
  // the listbox updates the value in the same tick as this callback.
  const handleCommit = () => {
    if (isValueDirty()) {
      handleSave();
    }
  };

  const handleCancel = () => {
    reset({ value: initialValue });
    onCancel?.();
  };

  const handleKeyDown = formKeyHandler({
    canSubmit: !!onSave && isDirty,
    onSubmit: handleSave,
    onCancel: handleCancel,
    multiline: dataType === 'longText' || dataType === 'label',
  });

  const editorField = (
    <Controller
      name="value"
      control={control}
      render={({ field: { value: formValue, onChange } }) => (
        <FieldEditor
          value={formValue}
          onChange={(e: string | string[] | null) => handleChange(e, onChange)}
          onCommit={handleCommit}
          dataType={dataType}
          enumValues={enumValues}
          disabled={disabled}
          focus={true}
          ariaLabel={ariaLabel}
        />
      )}
    />
  );

  return {
    rowRef,
    isDirty,
    clearDisabled: initialValue === null && !isDirty,
    editorField,
    handleSave,
    handleBlur,
    handleCancel,
    handleKeyDown,
  };
}
