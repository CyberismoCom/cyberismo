import { Box, Grid, Stack, TextField, Typography } from '@mui/material'
import React, { useState } from 'react'
import { DataType, EnumDefinition, MetadataValue } from '../lib/definitions'
import FieldEditor from './FieldEditor'
import { metadataValueToString } from '../lib/utils'
import { useTranslation } from 'react-i18next'

type EditableFieldProps = {
  value: MetadataValue
  dataType: DataType
  label: string
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
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
      <Typography variant="body2" width="40%" maxWidth={150} flexShrink={0}>
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
        <Typography variant="body2">
          {metadataValueToString(value, dataType, t, enumValues)}
        </Typography>
      )}
    </Stack>
  )
}

export default EditableField
