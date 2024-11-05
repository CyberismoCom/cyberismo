/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useCallback, useMemo, useState } from 'react';
import { useCardType, useFieldTypes } from '../lib/api';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionDetails, Box, Link, Stack } from '@mui/joy';
import {
  Control,
  Controller,
  FormProvider,
  useForm,
  useFormContext,
} from 'react-hook-form';
import {
  CardMetadata,
  CustomField,
  DataType,
  FieldType,
  MetadataValue,
} from '../lib/definitions';
import EditableField, { EditableFieldProps } from './EditableField';

interface FieldItemProps {
  expanded?: boolean;
  control?: Control;
  defaultValue: MetadataValue | null;
  editableFieldProps: Omit<Omit<EditableFieldProps, 'onChange'>, 'value'>;
  name: string;
  handleChange?: (
    e: any,
    onChange: (arg0: MetadataValue) => void,
    dataType: DataType,
  ) => void;
}

function FieldItem({
  expanded,
  control,
  name,
  defaultValue,
  editableFieldProps,
  handleChange,
}: FieldItemProps) {
  return (
    <Accordion expanded={expanded}>
      <AccordionDetails>
        {control ? (
          <Controller
            name={name}
            control={control}
            defaultValue={defaultValue}
            render={({ field: { value, onChange } }: any) => {
              return (
                <EditableField
                  value={value}
                  onChange={(e) => {
                    if (handleChange)
                      handleChange(e, onChange, editableFieldProps.dataType);
                  }}
                  {...editableFieldProps}
                />
              );
            }}
          />
        ) : (
          <EditableField value={defaultValue} {...editableFieldProps} />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export interface MetadataViewProps {
  initialExpanded?: boolean;
  editMode?: boolean;
  metadata?: CardMetadata;
  onClick?: () => void;
  cardKey: string;
}

function MetadataView({
  initialExpanded,
  editMode,
  metadata,
  cardKey,
  onClick,
}: MetadataViewProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(initialExpanded);

  const { cardType } = useCardType(metadata?.cardType ?? null);

  const { fieldTypes } = useFieldTypes();

  const context = useFormContext(); // must be inside a <FormProvider>

  // TODO: replace with yup schemas
  const handleChange = useCallback(
    (
      value: string | null,
      onChange: (arg0: MetadataValue) => void,
      dataType: DataType | undefined,
    ) => {
      switch (dataType) {
        case 'number':
        case 'integer':
          onChange(value ? parseFloat(value) : null);
          break;
        case 'boolean':
          onChange(value === 'true' ? true : value === 'false' ? false : null);
          break;
        case 'list':
          onChange(value ? value.split(',').map((v) => v.trim()) : []);
          break;
        case 'shortText':
        case 'longText':
        case 'date':
        case 'dateTime':
        case 'person':
        case 'enum':
          onChange(value === '' ? null : value);
          break;
        default:
          onChange(value);
      }
    },
    [],
  );

  const editableFields = useMemo(() => {
    if (!cardType) {
      return [];
    }
    return (
      cardType.customFields
        ?.filter((f: CustomField) => f.isEditable)
        .map((f: CustomField) => f.name) ?? []
    );
  }, [cardType]);

  const allFieldKeys = useMemo(() => {
    if (!cardType) {
      return [];
    }
    return (cardType.alwaysVisibleFields ?? []).concat(
      cardType.optionallyVisibleFields ?? [],
    );
  }, [cardType]);

  const allFields = useMemo(() => {
    if (!fieldTypes) return [];
    return allFieldKeys
      .map((field: string) =>
        fieldTypes?.find((f: FieldType) => f.name === field),
      )
      .filter((f) => f != null) as FieldType[];
  }, [allFieldKeys, fieldTypes]);

  return (
    <Box
      data-cy="metadataView"
      bgcolor="neutral.softBg"
      borderRadius={16}
      paddingY={1}
      paddingRight={2}
      paddingLeft={4}
      flexDirection="row"
      display="flex"
      sx={{
        cursor: editMode
          ? 'default'
          : 'url("/static/images/cursor_pen_32x32.png") 16 32, default',
      }}
      onClick={onClick}
    >
      <Stack flexGrow={1} spacing={1} paddingY={2}>
        <FieldItem
          name="__key__"
          defaultValue={cardKey}
          expanded={true}
          editableFieldProps={{
            label: t('cardKey'),
            dataType: 'shortText',
            edit: false,
          }}
        />
        <FieldItem
          name="__cardtype__"
          defaultValue={metadata?.cardType || ''}
          expanded={true}
          editableFieldProps={{
            label: t('cardType'),
            dataType: 'shortText',
            edit: false,
          }}
        />
        {allFields.map(({ name, dataType, enumValues, displayName }) => (
          <FieldItem
            name={name}
            handleChange={handleChange}
            defaultValue={metadata?.[name] ?? null}
            expanded={cardType?.alwaysVisibleFields?.includes(name) || expanded}
            key={name}
            control={context.control}
            editableFieldProps={{
              dataType,
              label: displayName || name,
              edit: (editMode && editableFields.includes(name)) ?? false,
              enumValues,
            }}
          />
        ))}
      </Stack>
      {!(allFieldKeys.length === cardType?.alwaysVisibleFields?.length) &&
        allFieldKeys.length !== 0 && (
          <Box alignContent="flex-end" flexShrink={0} paddingLeft={1}>
            <Link
              variant="soft"
              color="primary"
              underline="none"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              bgcolor="inherit"
              sx={{
                '&:hover': {
                  bgcolor: 'inherit',
                },
              }}
            >
              {expanded ? t('showLess') : t('showMore')}
            </Link>
          </Box>
        )}
    </Box>
  );
}
// Allows to use useFormContext outside of a FormProvider
export default function Wrapper(props: MetadataViewProps) {
  const context = useForm();

  return props.editMode ? (
    <MetadataView {...props} />
  ) : (
    <FormProvider {...context}>
      <MetadataView {...props} />
    </FormProvider>
  );
}
