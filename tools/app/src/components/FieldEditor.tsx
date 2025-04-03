/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Select,
  Option,
  Input,
  Textarea,
  Chip,
  ChipDelete,
  Box,
  Stack,
  IconButton,
} from '@mui/joy';
import { DataType, EnumDefinition, MetadataValue } from '../lib/definitions';
import { useTranslation } from 'react-i18next';
import { Add, Person } from '@mui/icons-material';
import { useState } from 'react';

export interface FieldEditorProps {
  value: MetadataValue;
  dataType?: DataType | 'label';
  onChange?: (value: string | string[] | null) => void;
  enumValues?: Array<EnumDefinition>;
  disabled?: boolean;
  focus?: boolean;
}

export default function FieldEditor({
  value,
  onChange,
  dataType,
  enumValues,
  disabled,
  focus,
}: FieldEditorProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  switch (dataType) {
    case 'integer':
    case 'number':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as number | null) ?? ''}
          type="number"
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          placeholder={
            dataType === 'integer'
              ? t('placeholder.integer')
              : t('placeholder.number')
          }
        />
      );

    case 'boolean':
      return (
        <Select
          value={value?.toString() ?? ''}
          disabled={disabled}
          onChange={(_, value) => onChange?.(value)}
          color="primary"
          sx={{
            width: '100%',
          }}
          size="sm"
          autoFocus={focus}
          placeholder={t('placeholder.boolean')}
        >
          <Option value="">{t('none')}</Option>
          <Option value="true">{t('yes')}</Option>
          <Option value="false">{t('no')}</Option>
        </Select>
      );
    case 'enum':
      return (
        <Select
          value={(value as string | null) ?? ''}
          disabled={disabled}
          onChange={(_, value) => onChange?.(value)}
          color="primary"
          sx={{
            width: '100%',
          }}
          size="sm"
          autoFocus={focus}
          placeholder={t('placeholder.enum')}
        >
          <Option value="" key="none">
            {t('none')}
          </Option>
          {enumValues?.map((enumDef) => (
            <Option key={enumDef.enumValue} value={enumDef.enumValue}>
              {enumDef.enumDisplayValue}
            </Option>
          ))}
        </Select>
      );
    case 'list':
      return (
        <Select
          value={(value as string[] | null) ?? []}
          multiple
          onChange={(_, value) => onChange?.(value)}
          color="primary"
          sx={{
            width: '100%',
          }}
          size="sm"
          autoFocus={focus}
          placeholder={t('placeholder.enum')}
          disabled={disabled}
        >
          {enumValues?.map((enumDef) => (
            <Option key={enumDef.enumValue} value={enumDef.enumValue}>
              {enumDef.enumDisplayValue}
            </Option>
          ))}
        </Select>
      );
    case 'date':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          type="date"
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
        />
      );
    case 'dateTime':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          type="datetime-local"
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
        />
      );
    case 'person':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          endDecorator={<Person color="primary" fontSize="small" />}
          placeholder={t('placeholder.person')}
        />
      );
    case 'longText':
      return (
        <Textarea
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          minRows={3}
          sx={{
            width: '100%',
          }}
          autoFocus={focus}
          placeholder={t('placeholder.longText')}
        />
      );
    case 'label':
      return (
        <Stack spacing={1} width="100%">
          <Stack direction="row" spacing={1}>
            <Input
              onChange={(e) => setLabel(e.target.value)}
              disabled={disabled}
              value={label}
              color="primary"
              size="sm"
              fullWidth
              placeholder={t('placeholder.label')}
            />
            <IconButton
              size="sm"
              color="primary"
              variant="soft"
              onClick={() => {
                if (!label) {
                  return;
                }
                const copy = Array.isArray(value)
                  ? [...value].filter((item) => item !== label)
                  : [];
                copy.push(label);

                setLabel('');

                onChange?.(copy as string[]);
              }}
            >
              <Add />
            </IconButton>
          </Stack>
          <Box>
            {(value as string[] | null)?.map((label) => (
              <Chip
                key={label}
                variant="soft"
                color="primary"
                endDecorator={
                  <ChipDelete
                    disabled={disabled}
                    onDelete={() =>
                      onChange?.(
                        (value as string[] | null)?.filter(
                          (l) => label !== l,
                        ) ?? [],
                      )
                    }
                  />
                }
              >
                {label}
              </Chip>
            ))}
          </Box>
        </Stack>
      );
    case 'shortText':
    default:
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          fullWidth
          autoFocus={focus}
          placeholder={t('placeholder.shortText')}
        />
      );
  }
}
