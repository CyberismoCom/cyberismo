/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useSWRHook } from './common';
import { callApi, apiPaths } from '../swr';

import { SWRConfiguration, mutate } from 'swr';
import { CardUpdate } from './types';
import { CardDetails, Project } from '../definitions';
import { useAppDispatch } from '../hooks';
import { cardDeleted } from '../actions';
import { createLink, removeLink } from './actions';
import { LinkDirection } from '@cyberismocom/data-handler/types/queries';

export const useCard = (key: string | null, options?: SWRConfiguration) => {
  const dispatch = useAppDispatch();
  const { callUpdate, ...rest } = useSWRHook(
    key ? apiPaths.card(key) : null,
    'card',
    options,
  );

  return {
    ...rest,
    updateCard: async (update: CardUpdate) =>
      (key && (await callUpdate(() => updateCard(key, update)))) || null,
    deleteCard: async () => {
      if (!key) return;
      await callUpdate(() => deleteCard(key));
      dispatch(cardDeleted(key));
    },
    createCard: async (template: string) =>
      await callUpdate(() => createCard(key ?? 'root', template)),
    updateWorkFlowState: async (state: string) =>
      (key &&
        (await callUpdate(() =>
          updateCard(key, {
            state: { name: state },
          }),
        ))) ||
      null,
    createLink: async (
      target: string,
      type: string,
      linkDescription?: string,
      direction: LinkDirection = 'outbound',
    ) =>
      (key &&
        (await callUpdate(() =>
          createLink(
            direction === 'outbound' ? key : target,
            direction === 'outbound' ? target : key,
            type,
            linkDescription,
          ).then(() => {
            mutate(apiPaths.card(key));
          }),
        ))) ||
      null,
    deleteLink: async (
      target: string,
      direction: LinkDirection,
      linkType: string,
      linkDescription?: string,
    ) =>
      (key &&
        (await callUpdate(() =>
          removeLink(
            direction === 'outbound' ? key : target,
            direction === 'outbound' ? target : key,
            linkType,
            linkDescription,
          ).then(() => {
            mutate(apiPaths.card(key));
          }),
        ))) ||
      null,
    editLink: async (
      target: string,
      direction: LinkDirection,
      linkType: string,
      previousLinkType: string,
      previousCardKey: string,
      previousDirection: LinkDirection,
      linkDescription?: string,
      previousLinkDescription?: string,
    ) => {
      return (key &&
        (await callUpdate(() => {
          // Current link structure
          const sourceKey = direction === 'outbound' ? key : target;
          const destKey = direction === 'outbound' ? target : key;
          
          // Original link structure
          const oldDirection = previousDirection;
          const oldSourceKey = oldDirection === 'outbound' 
            ? key 
            : (previousCardKey || target);
          const oldDestKey = oldDirection === 'outbound' 
            ? (previousCardKey || target) 
            : key;
          const oldLinkType = previousLinkType || linkType;
          
          return removeLink(
            oldSourceKey,
            oldDestKey,
            oldLinkType,
            previousLinkDescription,
          )
            .then(() =>
              createLink(
                sourceKey,
                destKey,
                linkType,
                linkDescription,
              ),
            )
            .then(() => mutate(apiPaths.card(key)));
        }))) ||
        null;
    },
  };
};
export async function updateCard(key: string, cardUpdate: CardUpdate) {
  const swrKey = apiPaths.card(key);
  const result = await callApi<CardDetails>(swrKey, 'PATCH', cardUpdate);

  // update swr cache for the card and project
  // revalidation not needed since api returns the updated card
  mutate(swrKey, result, false);

  mutate(apiPaths.tree());
}

export async function deleteCard(key: string) {
  const swrKey = apiPaths.card(key);
  await callApi(swrKey, 'DELETE');

  mutate(swrKey, undefined, false);

  mutate(apiPaths.tree());
}

export async function createCard(
  parentKey: string,
  template: string,
): Promise<string[]> {
  const result = await callApi<string[]>(apiPaths.card(parentKey), 'POST', {
    template,
  });

  // revalidate whole project
  mutate(apiPaths.tree());

  return result;
}
