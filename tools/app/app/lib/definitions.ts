import { workflowCategory } from '@cyberismocom/data-handler/interfaces/project-interfaces'

export interface Project {
  name: string
  cards: Card[]
  workflows: Workflow[]
  cardTypes: CardType[]
}

// Single card with metadata and children, but no content.
// Used in displaying the tree menu view.
export interface Card {
  key: string
  path: string
  metadata?: CardMetadata
  children?: Card[]
}

// Single card with content and metadata, but no info of children.
// Used for displaying card details view.
export interface CardDetails {
  key: string
  path: string
  content?: string
  metadata?: CardMetadata
  attachments?: CardAttachment[]
}

export type CardMetadata = {
  summary: string
  workflowState: string
  cardtype: string
} & Record<string, MetadataValue>

export type MetadataValue = string | number | boolean | Date | string[] | null

export interface CardAttachment {
  card: string
  fileName: string
  path: string
}

export enum CardMode {
  VIEW,
  EDIT,
}

export interface Workflow {
  name: string
  states: WorkflowState[]
  transitions: WorkflowTransition[]
}

export interface WorkflowState {
  name: string
  category?: workflowCategory
}

export interface WorkflowTransition {
  name: string
  fromState: string[]
  toState: string
}

export interface customField {
  name: string
  displayName: string
  isEditable: boolean
}

export interface CardType {
  name: string
  workflow: string
  alwaysVisibleFields: string[]
  customFields: customField[]
}

export type FieldTypes = Array<FieldTypeDefinition>

export type FieldTypeKey = string

export type DataType =
  | 'shorttext'
  | 'longtext'
  | 'enum'
  | 'date'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'list'
  | 'date'
  | 'datetime'
  | 'person'

export type EnumDefinition = {
  enumValue: string
  enumDisplayValue: string
  enumDescription?: string
}

export interface FieldTypeDefinition {
  name: string
  displayName?: string
  fieldDescription?: string
  dataType: DataType
  enumValues?: Array<EnumDefinition>
}
