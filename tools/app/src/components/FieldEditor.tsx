// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Select, Option, Input, Textarea, Button } from '@mui/joy';
import type {
  DataType,
  EnumDefinition,
  MetadataValue,
} from '../lib/definitions';
import { useTranslation } from 'react-i18next';
import Person from '@mui/icons-material/Person';
import LabelEditor from './LabelEditor';

export interface FieldEditorProps {
  value: MetadataValue;
  dataType?: DataType | 'label';
  onChange?: (value: string | string[] | null) => void;
  /**
   * Fires when a Select's listbox closes. Selects move focus into a
   * portalled listbox, so blur can't tell when dropdown editing ends.
   */
  onCommit?: () => void;
  enumValues?: Array<EnumDefinition>;
  disabled?: boolean;
  focus?: boolean;
  /** Accessible name for the control when no visible label is rendered. */
  ariaLabel?: string;
}

export default function FieldEditor({
  value,
  onChange,
  onCommit,
  dataType,
  enumValues,
  disabled,
  focus,
  ariaLabel,
}: FieldEditorProps) {
  const { t } = useTranslation();
  const handleListboxOpenChange = (open: boolean) => {
    if (!open) onCommit?.();
  };
  // The "Clear" button that clears a field and saves at once. It is a word and
  // not an ×, so that it is not confused with the cancel button next to the
  // editor. It is shown only when the field has a value. Stopping mousedown
  // keeps a Select listbox closed.
  const clearButton = (
    hasValue: boolean,
    emptyValue: string[] | null = null,
  ) =>
    hasValue && !disabled ? (
      <Button
        size="sm"
        variant="plain"
        color="neutral"
        aria-label={t('clearField')}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          onChange?.(emptyValue);
          onCommit?.();
        }}
      >
        {t('clear')}
      </Button>
    ) : null;
  switch (dataType) {
    case 'integer':
    case 'number':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as number | null) ?? ''}
          type="number"
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          placeholder={
            dataType === 'integer'
              ? t('placeholder.integer')
              : t('placeholder.number')
          }
        />
      );

    case 'boolean':
      return (
        <Select
          value={value == null ? null : value.toString()}
          disabled={disabled}
          onChange={(_, value) => onChange?.(value)}
          onListboxOpenChange={handleListboxOpenChange}
          color="primary"
          sx={{
            width: '100%',
          }}
          size="sm"
          autoFocus={focus}
          slotProps={{ button: { 'aria-label': ariaLabel } }}
          placeholder={t('placeholder.boolean')}
          endDecorator={clearButton(value != null)}
        >
          <Option value="true">{t('yes')}</Option>
          <Option value="false">{t('no')}</Option>
        </Select>
      );
    case 'enum':
      return (
        <Select
          value={(value as string | null) || null}
          disabled={disabled}
          onChange={(_, value) => onChange?.(value)}
          onListboxOpenChange={handleListboxOpenChange}
          color="primary"
          sx={{
            width: '100%',
          }}
          size="sm"
          autoFocus={focus}
          slotProps={{ button: { 'aria-label': ariaLabel } }}
          placeholder={t('placeholder.enum')}
          endDecorator={clearButton(!!value)}
        >
          {enumValues?.map((enumDef) => (
            <Option key={enumDef.enumValue} value={enumDef.enumValue}>
              {enumDef.enumDisplayValue}
            </Option>
          ))}
        </Select>
      );
    case 'list':
      return (
        <Select
          value={(value as string[] | null) ?? []}
          multiple
          onChange={(_, value) => onChange?.(value)}
          onListboxOpenChange={handleListboxOpenChange}
          color="primary"
          sx={{
            width: '100%',
          }}
          size="sm"
          autoFocus={focus}
          slotProps={{ button: { 'aria-label': ariaLabel } }}
          placeholder={t('placeholder.enum')}
          disabled={disabled}
          endDecorator={clearButton(
            Array.isArray(value) && value.length > 0,
            [],
          )}
        >
          {enumValues?.map((enumDef) => (
            <Option key={enumDef.enumValue} value={enumDef.enumValue}>
              {enumDef.enumDisplayValue}
            </Option>
          ))}
        </Select>
      );
    case 'date':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          type="date"
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          endDecorator={clearButton(!!value)}
        />
      );
    case 'dateTime':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          type="datetime-local"
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          endDecorator={clearButton(!!value)}
        />
      );
    case 'person':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          endDecorator={<Person color="primary" fontSize="small" />}
          placeholder={t('placeholder.person')}
        />
      );
    case 'longText':
      return (
        <Textarea
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          minRows={3}
          sx={{
            width: '100%',
          }}
          autoFocus={focus}
          slotProps={{ textarea: { 'aria-label': ariaLabel } }}
          placeholder={t('placeholder.longText')}
        />
      );
    case 'label':
      return (
        <LabelEditor
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(labels) => onChange?.(labels ?? [])}
          disabled={disabled}
          focus={focus}
        />
      );
    case 'shortText':
    default:
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          slotProps={{ input: { 'aria-label': ariaLabel } }}
          placeholder={t('placeholder.shortText')}
        />
      );
  }
}
