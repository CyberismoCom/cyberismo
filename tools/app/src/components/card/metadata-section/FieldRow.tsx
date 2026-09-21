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
import LockOutlined from '@mui/icons-material/LockOutlined';
import EditableField, { FieldLabel } from '@/components/EditableField';
import FieldEditor from '@/components/FieldEditor';
import { OverrideEditorFrame, OverriddenMarker } from './OverrideEditorFrame';
import { coerceMetadataValue, metadataValueToString } from '@/lib/utils';
import { focusLeftEditor, formKeyHandler } from '@/lib/hooks';

/**
 * The lane at the row's leading edge, holding the rail and — when the field is
 * read-only — a padlock outdented to the left of it. Put inline the lock
 * displaced its own label by 18px, so the label column had two left edges and
 * nothing to run the eye down.
 *
 * The lane is 27px because that is what keeps the label at the same x as the
 * document text below it; the rail therefore sits *inside* the lane rather
 * than at its end. The padlock's ink is only 9.3px of its 14px box, so at the
 * lane's end the rail had 11px of slack on the lock's side and none at all on
 * the label's — the label started exactly at the rail. Splitting it the other
 * way gives the label the 8px it needs and the lock keeps 5px it can spare.
 */
const LOCK_LANE = 27;
const RAIL_X = 17;

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

  const isClickable = !disabled && !isEditing && !!onStartEdit;

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
        /*
         * A persistent rail, not a hover one. Rows sit 8px apart while a
         * wrapped label leads at ~17px, so by proximity a label's second line
         * groups with the *next* row — the grouping is wrong at rest, and a
         * bar that only appears on hover cannot fix what you misread before
         * you point at it. The rail brackets each row whatever wraps inside.
         *
         * Drawn as a pseudo-element rather than this element's border, because
         * the padlock hangs to its left and AccordionDetails clips: both the
         * rail and the lock have to live out here, where overflow is visible.
         *
         * 2px, where the 3px rail elsewhere means workflow state: this one is
         * a grouping bracket and should not be mistaken for that device.
         */
        position: 'relative',
        paddingLeft: `${LOCK_LANE}px`,
        paddingRight: 0.5,
        marginY: expanded ? 0.5 : 0,
        // A collapsed row keeps its box but loses its height, and the rail and
        // the padlock hang outside the details element that does the
        // collapsing — so unless they are withheld here, every hidden
        // read-only field stacks another lock on the same pixel.
        ...(expanded && {
          '&::before': {
            content: '""',
            position: 'absolute',
            left: `${RAIL_X}px`,
            top: 0,
            bottom: 0,
            width: '2px',
            // Three steps that stay in order: the rail at rest reads as
            // structure, hover lifts it without changing what it means, and
            // editing takes it to full ink. Editing is an interaction state,
            // not a workflow one — it used to borrow the "in progress" colour,
            // which made an edited field look like a card mid-workflow.
            bgcolor: isEditing ? 'var(--cy-editing)' : 'var(--cy-rail)',
          },
          ...(isClickable && {
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: 'background.level1',
              '&::before': { bgcolor: 'var(--cy-rail-strong)' },
            },
          }),
        }),
      }}
    >
      {expanded && disabled && !isEditing && (
        <LockOutlined
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            // Centre on the label's first line rather than guess an offset:
            // (line-height - icon height) / 2, so it follows the type scale.
            top: 'calc(0.75rem * 1.45 / 2 - 7px)',
            height: 14,
            width: 14,
            color: 'neutral.500',
          }}
        />
      )}
      <AccordionDetails>
        {isEditing ? (
          <Stack
            ref={rowRef}
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 0.5, md: 4 }}
            onBlur={handleBlur}
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
              renderLock={false}
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
              renderLock={false}
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
