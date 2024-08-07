import { useSWRHook } from './common';
import { callApi, apiPaths } from '../swr';

import { SWRConfiguration, mutate } from 'swr';
import { CardUpdate } from './types';
import { CardDetails, Project } from '../definitions';
import {
  deleteCard as deleteCardHelper,
  deepCopy,
  moveCard,
  editCardDetails,
} from '../utils';
import { useAppDispatch } from '../hooks';
import { cardDeleted } from '../actions';

export const useCard = (key: string | null, options?: SWRConfiguration) => {
  const dispatch = useAppDispatch();
  return {
    ...useSWRHook(key ? apiPaths.card(key) : null, 'card', options),
    updateCard: async (update: CardUpdate) =>
      (key && updateCard(key, update)) || null,
    deleteCard: async () => {
      if (!key) return;
      await deleteCard(key);
      dispatch(cardDeleted(key));
    },
    createCard: async (template: string) =>
      (key && createCard(key, template)) || null,
    updateWorkFlowState: async (state: string) =>
      (key &&
        updateCard(key, {
          state: {
            name: state,
          },
        })) ||
      null,
  };
};
export async function updateCard(key: string, cardUpdate: CardUpdate) {
  const swrKey = apiPaths.card(key);
  const result = await callApi<CardDetails>(swrKey, 'PUT', cardUpdate);

  // update swr cache for the card and project
  // revalidation not needed since api returns the updated card
  mutate(swrKey, result, false);

  mutate(
    apiPaths.project(),
    (project: Project | undefined) => {
      if (!project) return project;
      let cards = editCardDetails(deepCopy(project.cards), result);

      if (cardUpdate.parent) {
        cards = moveCard(cards, key, cardUpdate.parent);
      }
      return {
        ...project,
        cards,
      };
    },
    false,
  );
}

export async function deleteCard(key: string) {
  const swrKey = apiPaths.card(key);
  await callApi(swrKey, 'DELETE');

  mutate(swrKey, undefined, false);

  mutate(
    apiPaths.project(),
    (project: Project | undefined) => {
      if (!project) return project;

      return {
        ...project,
        cards: deleteCardHelper(deepCopy(project.cards), key),
      };
    },
    false,
  );
}

export async function createCard(
  parentKey: string,
  template: string,
): Promise<string[]> {
  const result = await callApi<string[]>(apiPaths.card(parentKey), 'POST', {
    template,
  });

  // revalidate whole project
  mutate(apiPaths.project());

  return result;
}
