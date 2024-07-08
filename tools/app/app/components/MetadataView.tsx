import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCardType, useFieldTypes } from '../lib/api';
import { useTranslation } from 'react-i18next';
import { Box, Link, Stack } from '@mui/joy';
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
} from 'react-hook-form';
import {
  CardMetadata,
  DataType,
  FieldTypeDefinition,
  MetadataValue,
} from '../lib/definitions';
import { Collapse } from '@mui/material';
import EditableField from './EditableField';

export interface MetadataViewProps {
  initialExpanded?: boolean;
  editMode?: boolean;
  metadata?: CardMetadata;
  onClick?: () => void;
}

function MetadataView({
  initialExpanded,
  editMode,
  metadata,
  onClick,
}: MetadataViewProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(initialExpanded);

  const { cardType } = useCardType(metadata?.cardtype ?? null);

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
        case 'shorttext':
        case 'longtext':
        case 'date':
        case 'datetime':
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
      cardType.customFields?.filter((f) => f.isEditable).map((f) => f.name) ??
      []
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
      .map((field) => fieldTypes?.find((f) => f.name === field))
      .filter((f) => f != null) as FieldTypeDefinition[];
  }, [allFieldKeys, fieldTypes]);

  if (allFieldKeys.length === 0) {
    return null;
  }

  return (
    <Box
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
        {allFields.map(({ name, dataType, enumValues, displayName }) => (
          <Collapse
            in={cardType?.alwaysVisibleFields?.includes(name) || expanded}
            key={name}
          >
            <Controller
              name={name}
              control={context?.control}
              defaultValue={metadata?.[name] ?? null}
              render={({ field: { value, onChange } }: any) => {
                return (
                  <EditableField
                    value={value}
                    dataType={dataType}
                    edit={(editMode && editableFields.includes(name)) ?? false}
                    onChange={(e) => handleChange(e, onChange, dataType)}
                    enumValues={enumValues}
                    label={displayName || name}
                  />
                );
              }}
            />
          </Collapse>
        ))}
      </Stack>
      {!(allFieldKeys.length === cardType?.alwaysVisibleFields?.length) && (
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
