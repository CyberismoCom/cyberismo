import { useEffect, useMemo, useState, useRef } from 'react'
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
import { useForm } from 'react-hook-form'
import { usePathname } from 'next/navigation'

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

export function useCardKey() {
  const pathName = usePathname()
  const urlParts = pathName.slice(1).split('/')
  return urlParts[0] == 'cards' ? urlParts[1] ?? null : null
}

export function useIsMounted() {
  const isMounted = useRef(true)
  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])
  return useMemo(() => isMounted.current, [isMounted])
}

/**
 * Custom hook for handling forms with dynamic initial values
 */
export function useDynamicForm(values: Object) {
  const { reset, ...rest } = useForm()
  const [isReady, setIsReady] = useState(false)
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      reset(values)
      setIsReady(true)
    }
  }, [reset, values])
  return { isReady, ...rest }
}

/**
 * Converts metadata value to string
 * @param metadata: metadata value to convert to string
 * @returns
 */
export function metadataValueToString(
  metadata: MetadataValue,
  dataType: DataType,
  t: (value: string) => string,
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
  } else if (dataType === 'boolean') {
    return metadata ? t('yes') : t('no')
  } else {
    return metadata ? metadata.toString() : ''
  }
}
/**
 * Finds a card in a tree of cards
 */
export function findCard(cards: Card[], key: string): Card | null {
  for (const card of cards) {
    if (card.key === key) {
      return card
    }
    if (card.children) {
      const found = findCard(card.children, key)
      if (found) {
        return found
      }
    }
  }
  return null
}
/**
 * Counts the number of children of a card, including the card itself and children of children
 */
export function countChildren(card: Card): number {
  if (!card.children) {
    return 1
  }
  return card.children.reduce((acc, child) => acc + countChildren(child), 1)
}

/**
 * Deletes a card from a tree of cards
 * Note: This function mutates the input array
 */
export function deleteCard(cards: Card[], key: string): Card[] {
  for (const card of cards) {
    if (card.key === key) {
      return cards.filter((c) => c.key !== key)
    }
    if (card.children) {
      card.children = deleteCard(card.children, key)
    }
  }
  return cards
}

/**
 * Deep copy an object
 */
export function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
