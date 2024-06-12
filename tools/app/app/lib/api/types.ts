import { Project, CardDetails, FieldTypes } from '../definitions'
import { cardtype } from '@cyberismocom/data-handler/interfaces/project-interfaces'

import { SWRResponse } from 'swr'

export type Resources = {
  project: Project
  card: CardDetails
  fieldTypes: FieldTypes
  cardType: cardtype
}

export type ResourceName = keyof Resources

export type SwrResult<T extends ResourceName> = {
  [key in T]: Resources[T] | null
} & Omit<SWRResponse<Resources[T]>, 'data'>

export type FullCardUpdate = {
  content: string
  metadata: Record<string, any>
  state: { name: string }
}

export type CardUpdate = Partial<FullCardUpdate>
