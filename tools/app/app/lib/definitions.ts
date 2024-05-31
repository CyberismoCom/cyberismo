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

export interface CardMetadata {
  cardtype: string
  summary: string
  workflowState: string
}

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

export interface CardType {
  name: string
  workflow: string
}
