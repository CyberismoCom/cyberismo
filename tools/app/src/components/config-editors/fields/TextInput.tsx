// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { FormControl, FormLabel, Input } from '@mui/joy';
import type { BaseInputProps } from './types';

export interface TextInputProps extends BaseInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TextInput({
  label,
  value,
  onChange,
  onKeyDown,
  onBlur,
  disabled,
}: TextInputProps) {
  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        disabled={disabled}
      />
    </FormControl>
  );
}

export default TextInput;
