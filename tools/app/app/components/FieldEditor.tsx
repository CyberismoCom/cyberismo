import { Select, TextField, MenuItem, FormControl } from '@mui/material'
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
        <TextField
          size="small"
          onChange={onChange}
          value={value}
          type="number"
          color="primary"
          sx={{
            paddingTop: 1,
          }}
        />
      )

    case 'boolean':
      return (
        <FormControl size="small">
          <Select value={value} onChange={onChange} displayEmpty>
            <MenuItem value="true">{t('true')}</MenuItem>
            <MenuItem value="false">{t('false')}</MenuItem>
          </Select>
        </FormControl>
      )
    case 'enum':
      return (
        <FormControl size="small">
          <Select
            value={value}
            onChange={onChange}
            sx={{
              paddingTop: 1,
            }}
          >
            {enumValues?.map((enumDef) => (
              <MenuItem key={enumDef.enumValue} value={enumDef.enumValue}>
                {enumDef.enumDisplayValue}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )
    case 'shorttext':
    case 'longtext':
    case 'person':
    case 'date':
    case 'datetime':
    case 'list':
    default:
      return (
        <TextField
          size="small"
          onChange={onChange}
          value={value}
          color="primary"
        />
      )
  }
}
