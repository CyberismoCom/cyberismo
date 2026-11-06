// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import { Stack, Tooltip, Typography } from '@mui/joy';
import type { DataType, MetadataValue } from '../lib/definitions';
import FieldEditor from './FieldEditor';
import { containerRowSx, rowQuery } from './fieldRowFrame';
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
  /** Keep the label for assistive tech but hide it visually. */
  visuallyHidden?: boolean;
};

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

export function FieldLabel({
  label,
  description,
  disabled,
  edit,
  visuallyHidden,
}: FieldLabelProps) {
  return (
    <Typography
      level="body-xs"
      sx={
        visuallyHidden
          ? srOnly
          : {
              whiteSpace: 'normal',
              position: 'relative',
              flexShrink: 0,
              width: '100%',
              [rowQuery]: { width: '40%', maxWidth: 150 },
            }
      }
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
  /** Shown in read mode when the value is empty, so the row stays visible and clickable. */
  emptyText?: string;
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
  emptyText,
}: EditableFieldProps) => {
  const { t } = useTranslation();
  const text = metadataValueToString(value, dataType, t, enumValues);
  const showEmpty = !edit && !text && !!emptyText;
  return (
    <Stack sx={containerRowSx}>
      <FieldLabel
        label={label}
        description={hideLabel ? undefined : description}
        disabled={disabled}
        edit={edit}
        visuallyHidden={hideLabel}
      />
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
          fontWeight={showEmpty ? 'normal' : 'bold'}
          fontStyle={showEmpty ? 'italic' : undefined}
          textColor={showEmpty ? 'text.tertiary' : undefined}
          color={disabled ? 'neutral' : 'primary'}
          whiteSpace={dataType === 'longText' ? 'pre-line' : 'normal'}
        >
          {showEmpty ? emptyText : text}
          {valueDecorator}
        </Typography>
      )}
    </Stack>
  );
};

export default EditableField;
