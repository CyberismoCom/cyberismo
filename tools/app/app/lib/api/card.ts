import { useSWRHook } from './common'
import { callApi, apiPaths } from '../swr'

import { SWRConfiguration, mutate } from 'swr'
import { CardUpdate } from './types'
import { CardDetails, Project } from '../definitions'
import { deleteCard as deleteCardHelper, deepCopy } from '../utils'

export const useCard = (key: string | null, options?: SWRConfiguration) => ({
  ...useSWRHook(key ? apiPaths.card(key) : null, 'card', options),
  updateCard: async (update: CardUpdate) =>
    (key && updateCard(key, update)) || null,
  deleteCard: async () => (key && deleteCard(key)) || null,
  createCard: async (template: string) =>
    (key && createCard(key, template)) || null,
})

export async function updateCard(key: string, cardUpdate: CardUpdate) {
  const swrKey = apiPaths.card(key)
  const result = await callApi<CardDetails>(swrKey, 'PUT', cardUpdate)

  // update swr cache for the card and project
  // revalidation not needed since api returns the updated card
  mutate(swrKey, result, false)

  mutate(
    apiPaths.project(),
    (project: Project | undefined) => {
      if (!project) return project

      return {
        ...project,
        cards: project.cards.map((card) => {
          if (card.key === key) {
            return result
          }
          return card
        }),
      }
    },
    false
  )
}

export async function deleteCard(key: string) {
  const swrKey = apiPaths.card(key)
  await callApi(swrKey, 'DELETE')

  mutate(swrKey, undefined, false)

  mutate(
    apiPaths.project(),
    (project: Project | undefined) => {
      if (!project) return project

      return {
        ...project,
        cards: deleteCardHelper(deepCopy(project.cards), key),
      }
    },
    false
  )
}

export async function createCard(
  parentKey: string,
  template: string
): Promise<string[]> {
  const result = await callApi<string[]>(apiPaths.card(parentKey), 'POST', {
    template,
  })

  // revalidate whole project
  mutate(apiPaths.project())

  return result
}
