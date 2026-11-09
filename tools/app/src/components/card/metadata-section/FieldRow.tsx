// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  Box,
  IconButton,
  Stack,
  Tooltip,
} from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import type { DataType, MetadataValue } from '@/lib/definitions';
import type { EnumDefinition } from '@cyberismo/model/types/queries';
import EditableField, { FieldLabel } from '@/components/EditableField';
import { OverrideEditorFrame, OverriddenMarker } from './OverrideEditorFrame';
import { metadataValueToString } from '@/lib/utils';
import { isOverridden, presentsAsOverride } from './customFieldRow';
import { useFieldEditForm } from './useFieldEditForm';
import {
  fieldRowFrameSx,
  containerRowSx,
  rowValueWidthSx,
} from '@/components/fieldRowFrame';

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
  /** Tooltip on the disabled row. */
  disabledReason?: string;
  /** Omit the visible label; the display name becomes the control's aria-label. */
  hideLabel?: boolean;
  /** Read-mode text for an empty value; without it an empty value shows nothing. */
  emptyText?: string;
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
  disabledReason,
  hideLabel,
  emptyText,
  overrideMode,
  overrideValue,
  calculatedValue,
  onStartEdit,
  onSave,
  onAutoSave,
  onCancel,
}: FieldRowProps) {
  const { t } = useTranslation();
  const row = {
    value,
    overrideMode,
    overrideValue,
    calculatedValue,
    dataType,
    enumValues,
  };
  const presentAsOverride = presentsAsOverride(row);
  const formatValue = (v: MetadataValue) =>
    metadataValueToString(v ?? null, dataType, t, enumValues);

  const {
    rowRef,
    isDirty,
    clearDisabled,
    editorField,
    handleSave,
    handleBlur,
    handleCancel,
    handleKeyDown,
  } = useFieldEditForm({
    row,
    isEditing,
    disabled,
    ariaLabel: hideLabel ? label : undefined,
    onSave,
    onAutoSave,
    onCancel,
  });

  const isClickable = !disabled && !isEditing && !!onStartEdit;

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
        ...fieldRowFrameSx,
        borderColor: isEditing ? 'primary.300' : fieldRowFrameSx.borderColor,
        marginY: expanded ? fieldRowFrameSx.marginY : 0,
        // The rule ties a label to its value; without a label there is nothing to tie.
        ...(hideLabel && { borderLeft: 0 }),
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
            sx={containerRowSx}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          >
            <FieldLabel
              label={label}
              description={hideLabel ? undefined : description}
              disabled={disabled}
              edit={true}
              visuallyHidden={hideLabel}
            />
            {presentAsOverride ? (
              <OverrideEditorFrame
                calculatedValue={formatValue(calculatedValue ?? null)}
                editor={editorField}
                clearDisabled={disabled || clearDisabled}
                onClear={() => onSave?.(null)}
                actions={saveCancelButtons}
              />
            ) : (
              <Stack
                direction="row"
                alignItems="flex-start"
                spacing={0.5}
                sx={[
                  { flexGrow: 1, minWidth: 0 },
                  rowValueWidthSx,
                  // In a narrow container the buttons drop below the editor.
                  { flexWrap: 'wrap', rowGap: 0.5 },
                ]}
              >
                <Box flexGrow={1} minWidth={0} sx={{ flexBasis: '8rem' }}>
                  {editorField}
                </Box>
                {saveCancelButtons}
              </Stack>
            )}
          </Stack>
        ) : (
          <Tooltip
            title={disabled ? disabledReason : undefined}
            describeChild
            placement="top-start"
            disableInteractive
          >
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
                hideLabel={hideLabel}
                emptyText={emptyText}
                valueDecorator={
                  isOverridden(row) ? (
                    <OverriddenMarker
                      calculatedValue={formatValue(calculatedValue ?? null)}
                    />
                  ) : undefined
                }
              />
            </Box>
          </Tooltip>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
