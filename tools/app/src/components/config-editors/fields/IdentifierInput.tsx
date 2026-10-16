// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { FormControl, FormLabel, Input } from '@mui/joy';
import { Identifier } from '@/components/modals/resource-forms/Identifier';
import type { BaseInputProps } from './types';

export interface IdentifierInputProps extends BaseInputProps {
  label: string;
  type: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
}

export function IdentifierInput({
  label,
  type,
  prefix,
  value,
  onChange,
  onKeyDown,
  onBlur,
  disabled,
}: IdentifierInputProps) {
  const parts = value.split('/');
  const identifier = parts.length >= 3 ? parts[2] : value;

  // always include the full name
  const onChangeHandler = (newValue: string) => {
    if (parts.length !== 3) {
      throw new Error('Invalid identifier');
    }
    onChange(`${prefix}/${type}/${newValue}`);
  };

  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Input
        value={identifier}
        onChange={(e) => onChangeHandler(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        startDecorator={<Identifier prefix={prefix} type={type} />}
      />
    </FormControl>
  );
}

export default IdentifierInput;
