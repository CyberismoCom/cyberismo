// @todo: consider splitting this to several smaller files.

// Content in project files is either .schema, or project setting file.
// Interfaces are mainly symmetrical, optional members for values that are not needed.
export interface dotSchemaContent {
    id: string
    version: number
    cardkeyPrefix?: never
    name?: never
    nextAvailableCardNumber?: never
}

// Project's settings (=cardsconfig.json).
export interface projectSettings {
    id?: never
    version?: never
    cardkeyPrefix: string
    name: string
    nextAvailableCardNumber: number
}

// Module content
export interface moduleSettings extends projectSettings {
    path: string
    cardtypes: string[]
    calculations: string[]
    fieldtypes: string[]
    templates: string[]
    workflows: string[]
}

// Content in project (apart from cards) is either .schema files or cardsconfig.json.
type contentType = dotSchemaContent | projectSettings

// Files in project in addition to cards (.schema files and cardsconfig.json).
export interface projectFile {
    content: contentType
    path: string
    name: string
}

// One card; either in project or in template.
export interface card {
    key: string
    path: string
    content?: string
    metadata?: cardMetadata
    parent?: string
    children?: card[]
    attachments?: attachmentDetails[]
}

// When cards are listed using 'show cards'
export interface cardListContainer {
    name: string
    type: string
    cards: string[]
}

// Cardtype content.
export interface cardtype {
    name: string
    workflow: string
    customFields?: customField[]
    alwaysVisibleFields?: string[]
    optionallyVisibleFields?: string[]
}

// Card's index.json file content.
export interface cardMetadata {
    summary: string
    cardtype: string
    workflowState: string
    [otherOptions: string]: metadataContent
}

// FieldType content.
export interface fieldtype {
    name: string
    displayName?: string
    fieldDescription?: string
    dataType: string
    enumValues?: enumValue[]
}

// Project metadata details.
export interface project {
    name: string
    path: string
    prefix: string
    nextAvailableCardNumber: number
    numberOfCards: number
}

// Project resource, such as workflow, template or cardtype
export interface resource {
    name: string
    path?: string
}

// Template content.
export interface templateContent {
    name: string
    cards?: card[]
}

// Template configuration details.
export interface template {
    name: string
    path: string
    project: string
    numberOfCards: number
    metadata: templateMetadata
}

// Template configuration content details.
export interface templateMetadata {
    buttonLabel: string
    namePrompt: string
    displayName?: string
    description?: string
    category?: string
}

// Workflow's json file content.
export interface workflowMetadata {
    name: string
    states: workflowState[]
    transitions: workflowTransition[]
}

// Workflow state categories.
export enum workflowCategory {
    initial = 'initial',
    active = 'active',
    closed = 'closed',
}

// Workflow state.
export interface workflowState {
    name: string
    category?: workflowCategory
}

// Workflow transition.
export interface workflowTransition {
    name: string
    fromState: string[]
    toState: string
    requiredCardFields?: string[]
}

// Custom field enum value
export interface enumValue {
    enumValue: string
    enumDisplayValue: string
    enumDescription: string
}

// Custom field
export interface customField {
    name: string
    displayName?: string
    isEditable: boolean
}

// Attachment details
export interface attachmentDetails {
    card: string
    path: string
    fileName: string
}

// Name for a card (consists of prefix and running number; e.g. 'test_1')
export const cardNameRegEx = new RegExp(/^[a-z]+_[0-9]+$/)

// Define which details of a card are fetched.
export interface fetchCardDetails {
    attachments?: boolean
    calculations?: true
    children?: boolean
    content?: boolean
    contentType?: string // 'adoc', 'html'
    metadata?: boolean
    parent?: boolean
}

export type metadataContent = number | boolean | string | string[] | null
