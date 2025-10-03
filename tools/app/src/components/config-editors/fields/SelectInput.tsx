/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { FormControl, FormLabel, Option, Select } from '@mui/joy';
import type { BaseInputProps, OptionItem } from './types';

export interface SelectInputProps extends BaseInputProps {
  label: string;
  value: string;
  options: OptionItem[];
  onChange: (value: string) => void;
}

export function SelectInput({
  label,
  value,
  options,
  onChange,
  onBlur,
}: SelectInputProps) {
  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Select
        value={value}
        onChange={(_e, v) => onChange(v || '')}
        onBlur={onBlur}
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

export default SelectInput;
