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
        startDecorator={<Identifier prefix={prefix} type={type} />}
      />
    </FormControl>
  );
}

export default IdentifierInput;
