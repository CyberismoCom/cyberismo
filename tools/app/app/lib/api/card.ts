import { useSWRHook } from './common'
import { callApi, apiPaths } from '../swr'

import { SWRConfiguration, mutate } from 'swr'
import { CardUpdate } from './types'
import { CardDetails, Project } from '../definitions'

export const useCard = (key: string, options?: SWRConfiguration) => ({
  ...useSWRHook(apiPaths.card(key), 'card', options),
  updateCard: async (update: CardUpdate) => updateCard(key, update),
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
