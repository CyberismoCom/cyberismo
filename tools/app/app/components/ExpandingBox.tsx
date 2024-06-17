import React, { useCallback, useMemo, useState } from 'react'
import { Box, Button, Stack, Link } from '@mui/joy'
import { Collapse } from '@mui/material'

import { useTranslation } from 'react-i18next'
import EditableField from './EditableField'
import { Control, Controller, FieldValues } from 'react-hook-form'
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
  control: Control<FieldValues, any>
  editMode?: boolean
  color?: string
  onClick?: (e: any) => void
  initialExpanded?: boolean
}

export type CollapsingItemProps = {
  name: string
  label: string
  value: MetadataValue
  dataType: DataType
  editable: boolean
  alwaysVisible?: boolean
  enumValues?: Array<EnumDefinition>
  control: Control<FieldValues, any>
  editMode: boolean
  expanded: boolean
  onClick?: (e: any) => void
  handleChange: (
    e: any,
    onChange: (arg0: MetadataValue) => void,
    dataType: DataType | undefined
  ) => void
}

function CollapsingItem({
  name,
  label,
  value,
  dataType,
  editable,
  alwaysVisible,
  enumValues,
  control,
  editMode,
  expanded,
  onClick,
  handleChange,
}: CollapsingItemProps) {
  return (
    <Collapse
      in={expanded || alwaysVisible}
      sx={{
        cursor: editMode
          ? 'default'
          : 'url("/static/images/cursor_pen_32x32.png") 16 32, default',
      }}
      onClick={onClick}
      key={name}
    >
      {editable ? (
        <Controller
          name={name}
          control={control}
          render={({ field: { value, onChange } }: any) => {
            return (
              <EditableField
                value={value}
                dataType={dataType}
                edit={editMode}
                onChange={(e) => handleChange(e, onChange, dataType)}
                enumValues={enumValues}
                label={label}
              />
            )
          }}
        />
      ) : (
        <EditableField
          value={value}
          dataType={dataType}
          edit={false}
          label={label}
          enumValues={enumValues}
        />
      )}
    </Collapse>
  )
}

function ExpandingBox({
  values,
  control,
  editMode = false,
  color = 'soft',
  onClick,
  initialExpanded = false,
}: ExpandingBoxProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(initialExpanded)

  const allVisible = useMemo(
    () => values.every(({ alwaysVisible }) => alwaysVisible),
    [values]
  )
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

  if (values.length === 0) {
    return null
  }

  return (
    <Box
      bgcolor="neutral.softBg"
      borderRadius={4}
      paddingY={1}
      paddingRight={2}
      paddingLeft={4}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="stretch"
      >
        <Stack paddingY={values.length > 0 ? 2 : 0} flexGrow={1} spacing={1}>
          {values.map(
            ({
              key,
              value,
              dataType,
              alwaysVisible,
              editable,
              label,
              enumValues,
            }) => (
              <CollapsingItem
                key={key}
                name={key}
                label={label}
                value={value}
                dataType={dataType}
                editable={editable}
                alwaysVisible={alwaysVisible}
                enumValues={enumValues}
                control={control}
                editMode={editMode}
                expanded={expanded}
                onClick={onClick}
                handleChange={handleChange}
              />
            )
          )}
        </Stack>
        {!allVisible && (
          <Box
            display="flex"
            justifyContent="flex-end"
            flexDirection="column"
            flexShrink={0}
            marginBottom="2px"
          >
            <Link
              variant="soft"
              color="primary"
              underline="none"
              onClick={(e) => {
                e.preventDefault()
                setExpanded(!expanded)
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
      </Stack>
    </Box>
  )
}

export default ExpandingBox
