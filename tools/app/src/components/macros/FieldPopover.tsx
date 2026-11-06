// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useTranslation } from 'react-i18next';
import { Box, Button, Sheet, Stack } from '@mui/joy';
import { ClickAwayListener, Popper } from '@mui/material';
import type { MetadataValue } from '@/lib/definitions';
import { OverrideEditorFrame } from '@/components/card/metadata-section/OverrideEditorFrame';
import {
  presentsAsOverride,
  type FieldRowData,
} from '@/components/card/metadata-section/customFieldRow';
import { useFieldEditForm } from '@/components/card/metadata-section/useFieldEditForm';
import { metadataValueToString } from '@/lib/utils';
import { focusLeftEditor } from '@/lib/hooks';
import TargetLink from './TargetLink';
import type { FieldTarget } from './fieldTarget';

/** The field editor in a popup anchored to an inline value. */
export function FieldPopover({
  anchor,
  row,
  target,
  onSave,
  onClose,
}: {
  anchor: HTMLElement;
  row: FieldRowData;
  /** Linked above the editor when the field is on another card. */
  target?: FieldTarget;
  onSave: (value: MetadataValue) => void;
  /** `restoreFocus` is false when the user moved on by clicking or tabbing away. */
  onClose: (restoreFocus: boolean) => void;
}) {
  const { t } = useTranslation();
  const { dataType, enumValues } = row;

  const {
    rowRef,
    isDirty,
    clearDisabled,
    editorField,
    handleSave,
    handleCancel,
    handleKeyDown,
  } = useFieldEditForm({
    row,
    isEditing: true,
    ariaLabel: row.label,
    onSave,
    onCancel: () => onClose(true),
  });

  return (
    <Popper
      open
      anchorEl={anchor}
      placement="bottom-start"
      style={{ zIndex: 1300 }}
      modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
    >
      <ClickAwayListener
        onClickAway={(event) => {
          // The value button toggles the popover itself.
          if (!anchor.contains(event.target as Node)) onClose(false);
        }}
      >
        <Sheet
          ref={rowRef}
          variant="outlined"
          role="dialog"
          aria-label={row.label}
          data-cy="fieldMacroPopover"
          sx={{
            borderRadius: 'md',
            boxShadow: 'md',
            backgroundColor: 'background.popup',
            padding: 1.5,
            width: dataType === 'longText' ? 440 : 320,
            maxWidth: 'calc(100vw - 32px)',
          }}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            // A null target is a click on the padding or a window blur; click-away covers clicks.
            const next = event.relatedTarget as Node | null;
            if (
              next &&
              next !== anchor &&
              focusLeftEditor(event, rowRef.current)
            ) {
              onClose(false);
            }
          }}
        >
          {target && (
            <Box sx={{ marginBottom: 1 }}>
              <TargetLink target={target} />
            </Box>
          )}
          {presentsAsOverride(row) ? (
            <OverrideEditorFrame
              calculatedValue={metadataValueToString(
                row.calculatedValue ?? null,
                dataType,
                t,
                enumValues,
              )}
              editor={editorField}
              clearDisabled={clearDisabled}
              onClear={() => onSave(null)}
            />
          ) : (
            editorField
          )}
          <Stack
            direction="row"
            justifyContent="flex-end"
            spacing={1}
            sx={{ marginTop: 1 }}
          >
            <Button
              data-cy="fieldCancelButton"
              size="sm"
              variant="plain"
              color="neutral"
              onClick={handleCancel}
              onMouseDown={(e) => e.preventDefault()}
            >
              {t('cancel')}
            </Button>
            <Button
              data-cy="fieldSaveButton"
              size="sm"
              disabled={!isDirty}
              onClick={handleSave}
              onMouseDown={(e) => e.preventDefault()}
            >
              {t('save')}
            </Button>
          </Stack>
        </Sheet>
      </ClickAwayListener>
    </Popper>
  );
}
