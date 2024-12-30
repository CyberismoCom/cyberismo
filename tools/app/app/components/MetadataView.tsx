/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionDetails, Box, Link, Stack } from '@mui/joy';
import {
  Control,
  Controller,
  FormProvider,
  useForm,
  useFormContext,
} from 'react-hook-form';
import { DataType, MetadataValue } from '../lib/definitions';
import EditableField, { EditableFieldProps } from './EditableField';
import { CardResponse } from '../lib/api/types';
import { getDefaultValue } from '../lib/utils';

interface FieldItemProps {
  expanded?: boolean;
  control?: Control;
  defaultValue: MetadataValue | null;
  editableFieldProps: Omit<Omit<EditableFieldProps, 'onChange'>, 'value'>;
  name: string;
  handleChange?: (
    e: any,
    onChange: (arg0: MetadataValue) => void,
    dataType: DataType | 'label',
  ) => void;
  disabled?: boolean;
  description?: string;
}

function FieldItem({
  expanded,
  control,
  name,
  defaultValue,
  editableFieldProps,
  disabled,
  description,
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
                  disabled={disabled}
                  description={description}
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
  card: CardResponse;
  onClick?: () => void;
}

function MetadataView({
  initialExpanded,
  editMode,
  card,
  onClick,
}: MetadataViewProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(initialExpanded);

  const context = useFormContext(); // must be inside a <FormProvider>

  // TODO: replace with yup schemas
  const handleChange = useCallback(
    (
      value: string | null,
      onChange: (arg0: MetadataValue) => void,
      dataType: DataType | 'label',
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
          onChange(Array.isArray(value) ? value : []);
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
        cursor: editMode ? 'default' : 'pointer',
      }}
      onClick={onClick}
    >
      <Stack flexGrow={1} spacing={1} paddingY={2}>
        <FieldItem
          name="__key__"
          defaultValue={card.key}
          expanded={true}
          editableFieldProps={{
            label: t('cardKey'),
            dataType: 'shortText',
            edit: false,
          }}
        />
        <FieldItem
          name="__cardtype__"
          defaultValue={card.cardType}
          expanded={true}
          editableFieldProps={{
            label: t('cardType'),
            dataType: 'shortText',
            edit: false,
          }}
        />
        <FieldItem
          name="__labels__"
          defaultValue={card.labels}
          control={context.control}
          handleChange={handleChange}
          expanded={true}
          editableFieldProps={{
            label: t('labels'),
            dataType: 'label',
            edit: editMode ?? false,
          }}
        />
        {(card.fields ?? []).map(
          ({
            key,
            dataType,
            enumValues,
            fieldDisplayName,
            fieldDescription,
            visibility,
            isEditable,
            value,
          }) => (
            <FieldItem
              key={key}
              name={key}
              handleChange={handleChange}
              defaultValue={getDefaultValue(value)}
              expanded={visibility === 'always' || expanded}
              disabled={card.deniedOperations.editField
                .map((field) => field.fieldName)
                .includes(key)}
              control={context.control}
              description={fieldDescription}
              editableFieldProps={{
                dataType,
                label: fieldDisplayName || key,
                edit: (editMode && isEditable) ?? false,
                enumValues,
              }}
            />
          ),
        )}
      </Stack>
      {card.fields &&
        card.fields.filter((field) => field.visibility === 'always').length !==
          card.fields.length &&
        card.fields.length !== 0 && (
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
