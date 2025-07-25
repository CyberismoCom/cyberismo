/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Box, Chip, Stack, Tooltip, Typography } from '@mui/joy';
import { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { metadataValueToString } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { EnumDefinition } from '@cyberismo/data-handler/types/queries';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

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
    <Stack direction="row" spacing={0} alignItems="top">
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
          focus={focus}
        />
      ) : dataType === 'label' ? (
        <Box>
          {(value as string[] | null)?.map((label) => (
            <Chip
              key={label}
              variant="soft"
              color="primary"
              data-cy="labelChip"
              sx={{
                marginX: 0.2,
                marginBottom: 0.4,
              }}
            >
              {label}
            </Chip>
          ))}
        </Box>
      ) : (
        <Typography
          level="body-sm"
          whiteSpace={dataType === 'longText' ? 'pre-line' : 'normal'}
        >
          {metadataValueToString(value, dataType, t, enumValues)}
        </Typography>
      )}
    </Stack>
  );
};

export default EditableField;
