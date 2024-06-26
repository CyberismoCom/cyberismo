import { useMemo } from 'react'
import { useProject } from '../api'
import { countChildren, findCard } from '../utils'

/**
 * Helper for getting a list of cards from a project
 * Should be replaced by an approriate API call
 *
 */
export function useListCard(key: string) {
  const { project } = useProject()

  const listCard = useMemo(() => {
    return project ? findCard(project.cards, key) : null
  }, [project, key])

  return listCard
}
/**
 * Helper for getting the amount of children of a card
 * @param key
 * @returns
 */
export function useChildAmount(key: string) {
  const listCard = useListCard(key)

  const childAmount = useMemo(() => {
    return listCard ? countChildren(listCard) : 0
  }, [listCard])

  return childAmount
}
