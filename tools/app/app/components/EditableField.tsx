/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Stack, Typography } from '@mui/joy';
import React from 'react';
import { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { metadataValueToString } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { EnumDefinition } from '@cyberismocom/data-handler/types/queries';

export type EditableFieldProps = {
  value: MetadataValue;
  dataType: DataType;
  label: string;
  onChange?: (value: string | null) => void;
  edit: boolean;
  enumValues?: EnumDefinition[];
};

const EditableField = ({
  value,
  onChange,
  edit,
  label,
  dataType,
  enumValues,
}: EditableFieldProps) => {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={0} alignItems="center">
      <Typography level="title-sm" width="40%" maxWidth={150} flexShrink={0}>
        {label}
      </Typography>
      {edit ? (
        <FieldEditor
          value={value}
          onChange={onChange}
          dataType={dataType}
          enumValues={enumValues}
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
