import { Stack, Typography } from '@mui/joy'
import React from 'react'
import { DataType, EnumDefinition, MetadataValue } from '../lib/definitions'
import FieldEditor from './FieldEditor'
import { metadataValueToString } from '../lib/utils'
import { useTranslation } from 'react-i18next'

type EditableFieldProps = {
  value: MetadataValue
  dataType: DataType
  label: string
  onChange?: (value: string | null) => void
  edit: boolean
  enumValues?: Array<EnumDefinition>
}

const EditableField = ({
  value,
  onChange,
  edit,
  label,
  dataType,
  enumValues,
}: EditableFieldProps) => {
  const { t } = useTranslation()
  return (
    <Stack direction="row" spacing={0} alignItems="center">
      <Typography level="body-sm" width="40%" maxWidth={150} flexShrink={0}>
        {label}
      </Typography>
      {edit ? (
        <FieldEditor
          value={value}
          onChange={onChange}
          dataType={dataType}
          enumValues={enumValues}
        />
      ) : (
        <Typography level="body-sm">
          {metadataValueToString(value, dataType, t, enumValues)}
        </Typography>
      )}
    </Stack>
  )
}

export default EditableField
