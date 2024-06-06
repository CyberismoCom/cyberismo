import React, { use, useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Button, Collapse, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import EditableField from './EditableField'
import { Controller, useForm, useFormContext } from 'react-hook-form'
import {
  CardMetadata,
  DataType,
  EnumDefinition,
  MetadataValue,
} from '../lib/definitions'

export type ExpandingBoxProps = {
  values: Array<{
    key: string
    label: string
    dataType: DataType
    editable: boolean
    value: MetadataValue
    alwaysVisible?: boolean
    enumValues?: Array<EnumDefinition>
  }>
  editMode?: boolean
  color?: string
  onChange?: (key: string, value: string) => void
}
function ExpandingBox({
  values,
  editMode = false,
  color = 'background.default',
}: ExpandingBoxProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const allVisible = useMemo(
    () => values.every(({ alwaysVisible }) => alwaysVisible),
    [values]
  )

  // might used with or without react-hook-form
  const { control, reset } = editMode ? useFormContext() : useForm()

  useEffect(() => {
    if (!editMode) {
      reset(
        values.reduce<Partial<CardMetadata>>((acc, { key, value }) => {
          acc[key] = value
          return acc
        }, {})
      )
    }
  }, [values, reset])

  // TODO: replace with yup schemas
  const handleChange = useCallback(
    (
      e: any,
      onChange: (arg0: MetadataValue) => void,
      dataType: DataType | undefined
    ) => {
      const value = e.target.value
      switch (dataType) {
        case 'number':
        case 'integer':
          onChange(parseFloat(value))
          break
        case 'boolean':
          onChange(value === 'true')
          break
        default:
          onChange(value)
      }
    },
    []
  )
  return (
    <Box bgcolor={color} borderRadius={5} paddingY={1} paddingX={3}>
      {values.map(
        (
          { key, value, dataType, alwaysVisible, editable, label, enumValues },
          index
        ) => (
          <Collapse key={index} in={expanded || alwaysVisible}>
            {editable ? (
              <Controller
                name={key}
                control={control}
                render={({ field: { value, onChange } }: any) => (
                  <EditableField
                    value={value}
                    dataType={dataType}
                    edit={editMode}
                    label={label}
                    onChange={(e) => handleChange(e, onChange, dataType)}
                    enumValues={enumValues}
                  />
                )}
              />
            ) : (
              <EditableField
                value={value}
                dataType={dataType}
                edit={false}
                label={label}
              />
            )}
          </Collapse>
        )
      )}
      {!allVisible && (
        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="text"
            onClick={(e) => {
              e.preventDefault()
              setExpanded(!expanded)
            }}
            sx={{
              paddingY: 0,
              textTransform: 'none',
              fontWeight: 600,
            }}
            color={'bgColor' as any}
          >
            {expanded ? t('showLess') : t('showMore')}
          </Button>
        </Box>
      )}
    </Box>
  )
}

export default ExpandingBox
