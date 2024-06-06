import { ExpandingBoxProps } from '../components/ExpandingBox'
import {
  CardDetails,
  CardMetadata,
  FieldTypes,
  MetadataValue,
} from './definitions'
/**
 * Generates the values for the ExpandingBox component
 * @param card Card to generate values for
 * @param fieldTypes Custom field types
 * @param visibleFields Fields that should be always visible
 */
export function generateExpandingBoxValues(
  card: CardDetails | null,
  fieldTypes: FieldTypes | null,
  visibleFields?: string[]
): {
  fields: ExpandingBoxProps['values']
  values: Partial<CardMetadata>
} {
  const fields: ExpandingBoxProps['values'] = [
    {
      key: 'key',
      label: 'Card key',
      value: card?.key ?? '',
      editable: false,
      alwaysVisible: visibleFields?.includes('key'),
    },
    {
      key: 'type',
      label: 'Card type',
      value: card?.metadata?.cardtype ?? '',
      editable: false,
      alwaysVisible: visibleFields?.includes('type'),
    },
  ]

  for (const [key, value] of Object.entries(card?.metadata || {})) {
    if (!fieldTypes) {
      break
    }

    const fieldType = fieldTypes.find((field) => field.name === key)
    if (!fieldType) {
      continue
    }
    fields.push({
      key,
      label: fieldType.displayName || key,
      value,
      editable: true,
      dataType: fieldType.dataType,
      alwaysVisible: visibleFields?.includes(key),
      enumValues: fieldType.enumValues,
    })
  }
  return {
    fields,
    values: fields.reduce<Partial<CardMetadata>>((acc, { key, value }) => {
      acc[key] = value
      return acc
    }, {}),
  }
}
