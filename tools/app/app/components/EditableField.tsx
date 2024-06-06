import { Box, Grid, TextField, Typography } from '@mui/material'
import React, { useState } from 'react'
import { DataType, EnumDefinition, MetadataValue } from '../lib/definitions'
import FieldEditor from './FieldEditor'
import { metadataValueToString } from '../lib/utils'

type EditableFieldProps = {
  value: MetadataValue
  dataType?: DataType
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
  return (
    <Grid container spacing={2} alignItems="center">
      <Grid item xs={4}>
        <Typography>{label}</Typography>
      </Grid>
      <Grid item xs>
        {edit ? (
          <Box paddingTop={1}>
            <FieldEditor
              value={value}
              onChange={onChange}
              dataType={dataType}
              enumValues={enumValues}
            />
          </Box>
        ) : (
          <Typography>{metadataValueToString(value)}</Typography>
        )}
      </Grid>
    </Grid>
  )
}

export default EditableField
