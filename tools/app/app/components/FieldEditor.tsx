import { Select, TextField, Option, Input } from '@mui/joy'
import { DataType, EnumDefinition, MetadataValue } from '../lib/definitions'
import { useTranslation } from 'react-i18next'

export interface FieldEditorProps {
  value: MetadataValue
  dataType?: DataType
  onChange?: (event: any) => void
  enumValues?: Array<EnumDefinition>
}

export default function FieldEditor({
  value,
  onChange,
  dataType,
  enumValues,
}: FieldEditorProps) {
  const { t } = useTranslation()
  switch (dataType) {
    case 'integer':
    case 'number':
      return (
        <Input
          onChange={onChange}
          value={value as number}
          type="number"
          color="primary"
          size="sm"
        />
      )

    case 'boolean':
      return (
        <Select value={value as string} onChange={onChange} color="primary">
          <Option value="true">{t('true')}</Option>
          <Option value="false">{t('false')}</Option>
        </Select>
      )
    case 'enum':
      return (
        <Select value={value as string} onChange={onChange} color="primary">
          {enumValues?.map((enumDef) => (
            <Option key={enumDef.enumValue} value={enumDef.enumValue}>
              {enumDef.enumDisplayValue}
            </Option>
          ))}
        </Select>
      )
    case 'shorttext':
    case 'longtext':
    case 'person':
    case 'date':
    case 'datetime':
    case 'list':
    default:
      return (
        <Input
          onChange={onChange}
          value={value as string}
          color="primary"
          size="sm"
          sx={{
            width: 400,
          }}
        />
      )
  }
}
