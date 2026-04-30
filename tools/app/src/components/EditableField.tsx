/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Stack, Tooltip, Typography } from '@mui/joy';
import type { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { metadataValueToString } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import type { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';

export type FieldLabelProps = {
  label: string;
  description?: string;
  disabled?: boolean;
  edit: boolean;
};

export function FieldLabel({
  label,
  description,
  disabled,
  edit,
}: FieldLabelProps) {
  return (
    <Typography
      level="body-xs"
      sx={{
        whiteSpace: 'normal',
        position: 'relative',
        width: { xs: '100%', md: '40%' },
        maxWidth: { md: 150 },
        flexShrink: 0,
      }}
    >
      {disabled && !edit && (
        <LockOutlined
          sx={{
            height: 14,
            width: 14,
            mr: 0.5,
            verticalAlign: 'text-bottom',
            color: 'neutral.500',
          }}
        />
      )}
      {label}
      {description && (
        <Tooltip
          title={description}
          color="primary"
          variant="outlined"
          disableInteractive
        >
          <InfoOutlined
            color="primary"
            sx={{
              position: 'absolute',
              height: 16,
              width: 16,
              ml: 0.5,
            }}
          />
        </Tooltip>
      )}
    </Typography>
  );
}

export type EditableFieldProps = {
  value: MetadataValue;
  dataType: DataType | 'label';
  description?: string;
  label: string;
  onChange?: (value: string | string[] | null) => void;
  edit: boolean;
  disabled?: boolean;
  enumValues?: EnumDefinition[];
  focus?: boolean;
};

const EditableField = ({
  value,
  onChange,
  edit,
  label,
  dataType,
  description,
  enumValues,
  disabled,
  focus,
}: EditableFieldProps) => {
  const { t } = useTranslation();
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 0.5, md: 4 }}
    >
      <FieldLabel
        label={label}
        description={description}
        disabled={disabled}
        edit={edit}
      />
      {edit ? (
        <FieldEditor
          value={value}
          onChange={onChange}
          dataType={dataType}
          enumValues={enumValues}
          disabled={disabled}
          focus={focus}
        />
      ) : (
        <Typography
          level="body-xs"
          fontWeight="bold"
          color={disabled ? 'neutral' : 'primary'}
          whiteSpace={dataType === 'longText' ? 'pre-line' : 'normal'}
        >
          {dataType === 'label'
            ? (value as string[] | null)?.join(', ')
            : metadataValueToString(value, dataType, t, enumValues)}
        </Typography>
      )}
    </Stack>
  );
};

export default EditableField;
