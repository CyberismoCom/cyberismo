// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import { Stack, Tooltip, Typography } from '@mui/joy';
import type { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { metadataValueToString } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import type { EnumDefinition } from '@cyberismo/model/types/queries';
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
  hideLabel?: boolean;
  /** Rendered inline after the read-mode value, e.g. the overridden marker. */
  valueDecorator?: ReactNode;
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
  hideLabel,
  valueDecorator,
}: EditableFieldProps) => {
  const { t } = useTranslation();
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.5, md: 4 }}>
      {!hideLabel && (
        <FieldLabel
          label={label}
          description={description}
          disabled={disabled}
          edit={edit}
        />
      )}
      {edit ? (
        <FieldEditor
          value={value}
          onChange={onChange}
          dataType={dataType}
          enumValues={enumValues}
          disabled={disabled}
          focus={focus}
          ariaLabel={hideLabel ? label : undefined}
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
          {valueDecorator}
        </Typography>
      )}
    </Stack>
  );
};

export default EditableField;
