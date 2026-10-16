// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { FormControl, FormLabel, Option, Select } from '@mui/joy';
import type { BaseInputProps, OptionItem } from './types';

export interface MultiSelectInputProps extends BaseInputProps {
  label: string;
  value: string[];
  options: OptionItem[];
  onChange: (value: string[]) => void;
}

export function MultiSelectInput({
  label,
  value,
  options,
  onChange,
  onBlur,
  disabled,
}: MultiSelectInputProps) {
  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Select
        multiple
        value={value}
        onChange={(_e, v) => onChange(v as string[])}
        onBlur={onBlur}
        disabled={disabled}
      >
        {options.map((o) => (
          <Option key={o.id} value={o.id}>
            {o.displayName}
          </Option>
        ))}
      </Select>
    </FormControl>
  );
}

export default MultiSelectInput;
