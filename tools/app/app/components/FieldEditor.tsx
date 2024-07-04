import { Select, TextField, Option, Input } from '@mui/joy';
import { DataType, EnumDefinition, MetadataValue } from '../lib/definitions';
import { useTranslation } from 'react-i18next';

export interface FieldEditorProps {
  value: MetadataValue;
  dataType?: DataType;
  onChange?: (value: string | null) => void;
  enumValues?: Array<EnumDefinition>;
}

export default function FieldEditor({
  value,
  onChange,
  dataType,
  enumValues,
}: FieldEditorProps) {
  const { t } = useTranslation();
  switch (dataType) {
    case 'integer':
    case 'number':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          value={(value as number | null) ?? ''}
          type="number"
          color="primary"
          size="sm"
        />
      );

    case 'boolean':
      return (
        <Select
          value={value?.toString() ?? ''}
          onChange={(e, value) => onChange?.(value)}
          color="primary"
        >
          <Option value="true">{t('true')}</Option>
          <Option value="false">{t('false')}</Option>
        </Select>
      );
    case 'enum':
      return (
        <Select
          value={(value as string | null) ?? ''}
          onChange={(e, value) => onChange?.(value)}
          color="primary"
        >
          {enumValues?.map((enumDef) => (
            <Option key={enumDef.enumValue} value={enumDef.enumValue}>
              {enumDef.enumDisplayValue}
            </Option>
          ))}
        </Select>
      );
    case 'list':
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          value={Array.isArray(value) ? value.join(',') : ''}
          color="primary"
          size="sm"
          fullWidth
        />
      );
    case 'shorttext':
    case 'longtext':
    case 'person':
    case 'date':
    case 'datetime':
    default:
      return (
        <Input
          onChange={(e) => onChange?.(e.target.value)}
          value={(value as string | null) ?? ''}
          color="primary"
          size="sm"
          fullWidth
        />
      );
  }
}
