/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionDetails, Box, IconButton, Stack } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import { Controller, useForm } from 'react-hook-form';
import type { DataType, MetadataValue } from '../../lib/definitions';
import type { EditableFieldProps } from '../EditableField';
import EditableField from '../EditableField';
import type { CardResponse } from '../../lib/api/types';
import { getDefaultValue } from '../../lib/utils';
import { LABEL_SPLITTER } from '../../lib/constants';
import { format } from 'date-fns';

interface EditFieldItemProps {
  initialValue: MetadataValue;
  /** When set, the field is read-only and displays this value */
  forceValue?: MetadataValue;
  label: string;
  dataType: DataType | 'label';
  description?: string;
  enumValues?: EditableFieldProps['enumValues'];
  disabled?: boolean;
  /** Called with the current local value when the save button is clicked */
  onSave?: (value: MetadataValue) => void;
  /** Called on every change instead of showing a save button */
  onAutoSave?: (value: MetadataValue) => void;
}

export interface EditModeProps {
  card: CardResponse;
  onUpdate: (update: {
    metadata: Record<string, MetadataValue>;
  }) => Promise<void>;
}

function coerceValue(
  rawValue: string | string[] | null,
  dataType: DataType | 'label',
): MetadataValue {
  switch (dataType) {
    case 'number':
    case 'integer':
      return rawValue ? parseFloat(rawValue as string) : null;
    case 'boolean':
      return rawValue === 'true' ? true : rawValue === 'false' ? false : null;
    case 'list':
      return Array.isArray(rawValue) ? rawValue : [];
    case 'shortText':
    case 'longText':
    case 'date':
    case 'dateTime':
    case 'person':
    case 'enum':
      return rawValue === '' ? null : rawValue;
    default:
      return rawValue;
  }
}

function EditFieldItem({
  initialValue,
  forceValue,
  label,
  dataType,
  description,
  enumValues,
  disabled,
  onSave,
  onAutoSave,
}: EditFieldItemProps) {
  const {
    control,
    reset,
    getValues,
    formState: { isDirty },
  } = useForm({ defaultValues: { value: initialValue } });

  // serializedInitial is a stable proxy for initialValue's deep identity
  const serializedInitial = JSON.stringify(initialValue);
  useEffect(() => {
    reset({ value: initialValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedInitial, reset]);

  const isReadOnly = forceValue !== undefined;

  const handleChange = useCallback(
    (
      rawValue: string | string[] | null,
      onChange: (v: MetadataValue) => void,
    ) => {
      const coerced = coerceValue(rawValue, dataType);
      onChange(coerced);
      onAutoSave?.(coerced);
    },
    [dataType, onAutoSave],
  );

  return (
    <Accordion
      expanded={true}
      sx={{
        borderLeft: '3px solid',
        borderColor: 'neutral.300',
        paddingX: 0.5,
        marginY: 0.5,
      }}
    >
      <AccordionDetails>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box flexGrow={1}>
            {isReadOnly ? (
              <EditableField
                value={forceValue ?? ''}
                label={label}
                dataType={dataType}
                description={description}
                enumValues={enumValues}
                edit={false}
              />
            ) : (
              <Controller
                name="value"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <EditableField
                    value={value}
                    label={label}
                    dataType={dataType}
                    description={description}
                    enumValues={enumValues}
                    disabled={disabled}
                    edit={true}
                    onChange={(e) => handleChange(e, onChange)}
                  />
                )}
              />
            )}
          </Box>
          {onSave && !isReadOnly && (
            <IconButton
              data-cy="fieldSaveButton"
              size="sm"
              variant="soft"
              color="primary"
              disabled={!isDirty}
              onClick={() => onSave(getValues('value'))}
            >
              <CheckIcon />
            </IconButton>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

export function EditMode({ card, onUpdate }: EditModeProps) {
  const { t } = useTranslation();

  const handleSaveField = useCallback(
    async (metadataKey: string, value: MetadataValue) => {
      await onUpdate({ metadata: { [metadataKey]: value } });
    },
    [onUpdate],
  );

  return (
    <Stack flexGrow={1}>
      {(card.fields ?? []).map(
        ({
          key,
          dataType,
          enumValues,
          fieldDisplayName,
          fieldDescription,
          isCalculated,
          value,
        }) => (
          <EditFieldItem
            key={key}
            initialValue={
              isCalculated ? null : (getDefaultValue(value) ?? null)
            }
            forceValue={isCalculated ? getDefaultValue(value) : undefined}
            label={fieldDisplayName || key}
            dataType={dataType}
            description={fieldDescription}
            enumValues={enumValues}
            disabled={card.deniedOperations.editField
              .map((f) => f.fieldName)
              .includes(key)}
            onSave={
              isCalculated ? undefined : (val) => handleSaveField(key, val)
            }
          />
        ),
      )}
      <EditFieldItem
        initialValue={null}
        forceValue={card.cardTypeDisplayName || card.cardType}
        label={t('cardType')}
        dataType="shortText"
      />
      <EditFieldItem
        initialValue={card.labels ?? []}
        label={t('labels')}
        dataType="label"
        description={t('labelEditor.splitterHint', {
          splitter: LABEL_SPLITTER,
        })}
        onAutoSave={(val) => handleSaveField('labels', val)}
      />
      <EditFieldItem
        initialValue={card.createdAt ?? null}
        forceValue={
          card.createdAt ? format(new Date(card.createdAt), 'PPp') : undefined
        }
        label={t('createdAt')}
        dataType="dateTime"
        onSave={
          card.createdAt
            ? undefined
            : (val) => handleSaveField('createdAt', val)
        }
      />
      <EditFieldItem
        initialValue={null}
        forceValue={
          card.lastUpdated ? format(new Date(card.lastUpdated), 'PPp') : ''
        }
        label={t('lastUpdated')}
        dataType="dateTime"
      />
    </Stack>
  );
}
