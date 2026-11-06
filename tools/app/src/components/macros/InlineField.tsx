// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Tooltip } from '@mui/joy';
import LockOutlined from '@mui/icons-material/LockOutlined';
import type { MetadataValue } from '@/lib/definitions';
import { OverriddenMarker } from '@/components/card/metadata-section/OverrideEditorFrame';
import { isOverridden } from '@/components/card/metadata-section/customFieldRow';
import type { FieldRowData } from '@/components/card/metadata-section/customFieldRow';
import type { FieldEditability } from '@/lib/fieldEditability';
import { emptyFieldText } from '@/lib/emptyFieldText';
import { metadataValueToString } from '@/lib/utils';
import { FieldPopover } from './FieldPopover';
import { targetLabel, tooltipLines } from './fieldTarget';
import type { FieldTarget } from './fieldTarget';

export interface InlineFieldProps {
  row: FieldRowData;
  showLabel: boolean;
  editability: FieldEditability;
  /** Resolves true when the value was saved. */
  onSave: (value: MetadataValue) => Promise<boolean>;
  /** Set when the field belongs to a card other than the page's own. */
  target?: FieldTarget;
}

const mutedSx = { color: 'text.tertiary' } as const;

/** A field value inside a sentence or table cell; editable in a popover. */
export default function InlineField({
  row,
  showLabel,
  editability,
  onSave,
  target,
}: InlineFieldProps) {
  const { t } = useTranslation();
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const { label, dataType, enumValues } = row;
  const format = (value: MetadataValue | undefined) =>
    metadataValueToString(value ?? null, dataType, t, enumValues);
  const text = format(row.value);
  const empty = text === '';
  const { disabled, cause, reason } = editability;
  const emptyText = emptyFieldText(t, {
    label,
    dataType,
    disabled,
    display: 'inline',
  });

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) button?.focus();
  };

  const editable = !disabled;
  // A popover must not come back unasked when the field turns editable again.
  if (!editable && open) setOpen(false);
  // A lock for what policy forbids; a reader or preview only gets the reason.
  const denied = cause === 'denied';
  const reasonShown = denied || cause === 'role';

  let value: ReactNode;
  if (editable) {
    const name = empty ? emptyText : `${label}: ${text}`;
    value = (
      <>
        {/* On top, so it never covers the popover below the value. */}
        <Tooltip
          title={target && targetLabel(target)}
          placement="top"
          describeChild
          disableInteractive
        >
          <Box
            component="button"
            type="button"
            ref={setButton}
            data-cy="fieldMacroValue"
            aria-label={name}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => (open ? close(true) : setOpen(true))}
            sx={{
              font: 'inherit',
              color: empty ? 'text.tertiary' : 'inherit',
              fontStyle: empty ? 'italic' : 'inherit',
              textAlign: 'inherit',
              background: 'none',
              border: 'none',
              textDecorationLine: 'underline',
              textDecorationStyle: 'dashed',
              textDecorationColor: 'var(--joy-palette-neutral-400)',
              textUnderlineOffset: '3px',
              borderRadius: '3px',
              // The padding marks the value without moving the text around it.
              paddingX: '2px',
              marginX: '-2px',
              paddingY: 0,
              cursor: 'pointer',
              whiteSpace: dataType === 'longText' ? 'pre-line' : 'normal',
              '&:hover': {
                backgroundColor: 'background.level1',
                textDecorationColor: 'var(--joy-palette-primary-500)',
              },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: '0 0 0 2px var(--joy-palette-focusVisible)',
              },
            }}
          >
            {empty ? emptyText : text}
          </Box>
        </Tooltip>
        {open && button && (
          <FieldPopover
            anchor={button}
            row={row}
            target={target}
            onSave={async (next) => {
              if (await onSave(next)) close(true);
            }}
            onClose={close}
          />
        )}
      </>
    );
  } else {
    const plain = (
      <Box
        component="span"
        data-cy="fieldMacroValue"
        sx={{
          ...(denied && mutedSx),
          whiteSpace: dataType === 'longText' ? 'pre-line' : undefined,
        }}
      >
        {empty ? emptyText : text}
      </Box>
    );
    value = (
      <>
        <Tooltip
          title={tooltipLines(
            target && targetLabel(target),
            reasonShown ? reason : undefined,
          )}
          describeChild
          disableInteractive
        >
          {plain}
        </Tooltip>
        {denied && (
          <LockOutlined
            sx={{
              fontSize: '0.9em',
              marginLeft: 0.25,
              verticalAlign: '-0.1em',
              ...mutedSx,
            }}
          />
        )}
        {cause === 'calculated' && (
          <Tooltip
            title={t('calculatedField')}
            describeChild
            disableInteractive
          >
            <Box
              component="span"
              role="img"
              aria-label={t('fieldMacro.calculated')}
              sx={{ ...mutedSx, fontStyle: 'italic', marginLeft: 0.5 }}
            >
              {t('fieldMacro.calculatedMark')}
            </Box>
          </Tooltip>
        )}
      </>
    );
  }

  return (
    <Box component="span" data-cy="fieldMacro">
      {showLabel && (
        <Box component="span" sx={mutedSx}>
          {label}:{' '}
        </Box>
      )}
      {value}
      {isOverridden(row) && (
        <OverriddenMarker calculatedValue={format(row.calculatedValue)} />
      )}
    </Box>
  );
}
