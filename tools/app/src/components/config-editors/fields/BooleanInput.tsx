// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Checkbox, FormControl, FormLabel } from '@mui/joy';
import type { BaseInputProps } from './types';

export interface BooleanInputProps extends BaseInputProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function BooleanInput({
  label,
  value,
  onChange,
  onBlur,
  disabled,
}: BooleanInputProps) {
  return (
    <FormControl orientation="horizontal" sx={{ alignItems: 'center' }}>
      <Checkbox
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        onBlur={onBlur}
        disabled={disabled}
      />
      <FormLabel sx={{ ml: 1 }}>{label}</FormLabel>
    </FormControl>
  );
}

export default BooleanInput;
