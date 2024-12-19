/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Stack, Tooltip, Typography } from '@mui/joy';
import React from 'react';
import { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { metadataValueToString } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { EnumDefinition } from '@cyberismocom/data-handler/types/queries';
import { Description, InfoOutlined } from '@mui/icons-material';

export type EditableFieldProps = {
  value: MetadataValue;
  dataType: DataType;
  description?: string;
  label: string;
  onChange?: (value: string | string[] | null) => void;
  edit: boolean;
  disabled?: boolean;
  enumValues?: EnumDefinition[];
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
}: EditableFieldProps) => {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={0} alignItems="center">
      <Typography
        level="title-sm"
        width="40%"
        maxWidth={150}
        flexShrink={0}
        endDecorator={
          description && (
            <Tooltip title={description} color="primary" variant="outlined">
              <InfoOutlined fontSize="small" color="primary" />
            </Tooltip>
          )
        }
      >
        {label}
      </Typography>
      {edit ? (
        <FieldEditor
          value={value}
          onChange={onChange}
          dataType={dataType}
          enumValues={enumValues}
          disabled={disabled}
        />
      ) : (
        <Typography level="body-sm">
          {metadataValueToString(value, dataType, t, enumValues)}
        </Typography>
      )}
    </Stack>
  );
};

export default EditableField;
