// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { FormControl, FormLabel, Textarea } from '@mui/joy';
import type { BaseInputProps } from './types';

export interface TextareaInputProps extends BaseInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function TextareaInput({
  label,
  value,
  onChange,
  onKeyDown,
  onBlur,
  disabled,
}: TextareaInputProps) {
  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Textarea
        minRows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        disabled={disabled}
      />
    </FormControl>
  );
}

export default TextareaInput;
