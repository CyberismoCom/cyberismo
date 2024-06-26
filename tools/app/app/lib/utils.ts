import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
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
 * Hook that allows easy use of multiple modals at once
 */
export function useModals<T extends Record<string, boolean>>(modals: T) {
  const [openModals, setOpenModals] = useState<Record<keyof T, boolean>>(modals)
  const modalsRef = useRef(modals)

  useEffect(() => {
    // Check for equality
    if (
      Object.keys(modals).every((key) => modals[key] === modalsRef.current[key])
    )
      return

    // Update the modalsRef
    modalsRef.current = modals
    setOpenModals(modals)
  }, [modals, setOpenModals])

  const openModal = useCallback(
    (modal: keyof T) => () => {
      setOpenModals((prev) => ({ ...prev, [modal]: true }))
    },
    [setOpenModals]
  )

  const closeModal = useCallback(
    (modal: keyof T) => () => {
      setOpenModals((prev) => ({ ...prev, [modal]: false }))
    },
    [setOpenModals]
  )

  return { openModal, closeModal, modalOpen: openModals }
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
 * Finds the parent of a card in a tree of cards
 * @param cards: array of Cards with possible children Card arrays
 * @param key: key of the card to find the parent of
 * @returns parent card if found, otherwise null
 */
export function findParentCard(cards: Card[], key: string): Card | null {
  for (const card of cards) {
    if (card.children) {
      if (card.children.some((child) => child.key === key)) {
        return card
      }
      const found = findParentCard(card.children, key)
      if (found) {
        return found
      }
    }
  }
  return null
}

/**
 * Edits a card in a tree of cards
 * @param card
 * @returns
 */
export function editCard(cards: Card[], card: Card): Card[] {
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].key === card.key) {
      cards[i] = card
      return cards
    }
    if (cards[i].children) {
      cards[i].children = editCard(cards[i].children || [], card)
    }
  }
  return cards
}

/**
 * Edits a card in a tree of cards
 * This function converts CardDetails to Card before editing
 * @param card
 * @returns
 */
export function editCardDetails(cards: Card[], card: CardDetails): Card[] {
  const listCard = findCard(cards, card.key)
  if (!listCard) {
    return cards
  }
  return editCard(cards, {
    key: card.key,
    path: card.path,
    metadata: card.metadata,
    children: listCard.children,
  })
}

/**
 * Moves a card in a tree of cards
 */
export function moveCard(
  cards: Card[],
  cardKey: string,
  newParentKey: string
): Card[] {
  const card = findCard(cards, cardKey)
  if (!card) {
    return cards
  }
  const parent = findParentCard(cards, cardKey)
  if (!parent) {
    return cards
  }
  const newParent = findCard(cards, newParentKey)
  if (!newParent) {
    return cards
  }
  parent.children =
    parent.children?.filter((child) => child.key !== cardKey) || []
  newParent.children = newParent.children || []
  newParent.children.push(card)
  return cards
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
 * Return true if card is children of the other card
 * Could be much more efficient
 * @param card parent card to check if the other card is a child of
 * @param key key of the card to check if it is a child of the parent card
 * @returns
 */
export function isChildOf(card: Card, key: string): boolean {
  if (card.key === key) {
    return true
  }
  if (card.children) {
    for (const child of card.children) {
      if (isChildOf(child, key)) {
        return true
      }
    }
  }
  return false
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
