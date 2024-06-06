import { useMemo, useState } from 'react'
import {
  Card,
  CardDetails,
  CardMetadata,
  DataType,
  EnumDefinition,
  MetadataValue,
  Project,
  Workflow,
} from './definitions'
import { ApiCallError } from './swr'

/**
 * Flattens the Card tree into a single array of Cards
 * @param tree: array of Cards with possible children Card arrays
 * @returns array of all cards
 */
export function flattenTree(tree: Card[]): Card[] {
  const result: Card[] = []
  tree.forEach((node) => {
    result.push(node)
    if (node.children != null) {
      result.push(...flattenTree(node.children))
    }
  })
  return result
}

/**
 * Finds the path to the card, if exists
 * @param cardKey: card to search for
 * @param tree: array of Cards with possible children Card arrays
 * @returns array of cards starting from the root and ending with the card
 */
export function findPathTo(cardKey: string, tree: Card[]): Card[] | null {
  for (const card of tree) {
    const path = findPath(cardKey, card)
    if (path) {
      return path
    }
  }

  return null
}

/**
 * Finds the path to the card, if exists, starting from a single root card
 * @param cardKey: card to search for
 * @param card: card with possible children Card arrays
 * @returns array of cards starting from the root and ending with the card
 */
function findPath(cardKey: string, card: Card): Card[] | null {
  if (card.key === cardKey) {
    return [card]
  }

  if (card.children) {
    for (const child of card.children) {
      const leaf = findPath(cardKey, child)
      if (leaf) {
        return [card, ...leaf]
      }
    }
  }

  return null
}

/**
 * Finds the correct workflow for the card, if exists
 * @param card: card to search for
 * @param project: project object
 * @returns Workflow object if found, otherwise null
 */
export function findWorkflowForCard(
  card: CardDetails | Card | null,
  project: Project | null
): Workflow | null {
  if (!card || !project) return null

  let workflowName = project.cardTypes.find(
    (cardType) => cardType.name === card.metadata?.cardtype
  )?.workflow
  if (workflowName == undefined) return null

  if (workflowName.endsWith('.json')) {
    workflowName = workflowName.slice(0, -5)
  }

  return (
    project.workflows.find((workflow) => workflow.name === workflowName) ?? null
  )
}

export function replaceCardMetadata(
  key: string,
  metadata: CardMetadata | undefined,
  cards: Card[]
): Card[] {
  if (!metadata) return cards
  let updatedCards = cards
  updateCard(updatedCards, key, metadata)
  return updatedCards
}

function updateCard(cards: Card[], key: string, metadata: CardMetadata) {
  cards.forEach((card) => {
    if (card.key === key) {
      card.metadata = metadata
    } else {
      if (card.children) {
        updateCard(card.children, key, metadata)
      }
    }
  })
}

/**
 * General helper for handling errors
 */
export function useError() {
  const [error, setError] = useState<Error | string | null>(null)

  // use memo to store human readable error messages
  const reason = useMemo(() => {
    if (error instanceof ApiCallError) {
      return error.reason
    } else if (error instanceof Error) {
      return error.message
    } else {
      return error
    }
  }, [error])

  const handleClose = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === 'clickaway') {
      return
    }
    setError(null)
  }
  return { error, setError, handleClose, reason }
}
/**
 * Converts metadata value to string
 * @param metadata: metadata value to convert to string
 * @returns
 */
export function metadataValueToString(
  metadata: MetadataValue,
  dataType: DataType,
  enumValues?: Array<EnumDefinition>
): string {
  if (metadata instanceof Date) {
    return metadata.toISOString()
  } else if (metadata instanceof Array) {
    return metadata.join(', ')
  } else if (dataType === 'enum') {
    return (
      enumValues?.find((enumValue) => enumValue.enumValue === metadata)
        ?.enumDisplayValue ??
      metadata?.toString() ??
      ''
    )
  } else {
    return metadata ? metadata.toString() : ''
  }
}
