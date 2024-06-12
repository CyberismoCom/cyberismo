import { ExpandingBoxProps } from '../components/ExpandingBox'
import { CardDetails, CardMetadata, FieldTypes } from './definitions'
import { cardtype } from '@cyberismocom/data-handler/interfaces/project-interfaces'
/**
 * Generates the values for the ExpandingBox component
 * @param card Card to generate values for
 * @param fieldTypes Custom field types
 * @param visibleFields Fields that should be always visible
 */
export function generateExpandingBoxValues(
  card: CardDetails | null,
  fieldTypes: FieldTypes | null,
  visibleFields: string[],
  optionallyVisibleFields: string[],
  editableFields: string[]
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
      alwaysVisible: visibleFields.includes('key'),
      dataType: 'shorttext',
    },
    {
      key: 'type',
      label: 'Card type',
      value: card?.metadata?.cardtype ?? '',
      editable: false,
      alwaysVisible: visibleFields.includes('type'),
      dataType: 'shorttext',
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
    if (
      !optionallyVisibleFields.includes(key) &&
      !visibleFields.includes(key)
    ) {
      continue
    }
    fields.push({
      key,
      label: fieldType.displayName || key,
      value,
      editable: editableFields.includes(key),
      dataType: fieldType.dataType,
      alwaysVisible: visibleFields.includes(key),
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

export function getEditableFields(
  card: CardDetails,
  cardType: cardtype
): string[] {
  if (!card.metadata) {
    return []
  }
  return Object.keys(card.metadata).filter(
    (key) =>
      cardType.customFields?.find((field) => field.name === key)?.isEditable ||
      false
  )
}
