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
import { CardDetails } from '../definitions';
import { useAppDispatch } from '../hooks';
import { cardDeleted } from '../actions';
import { createLink, removeLink } from './actions';
import { LinkDirection } from '@cyberismocom/data-handler/types/queries';
import { CardAction } from './action-types';

import { setRecentlyCreated } from '../slices/card';
import { addNotification } from '../slices/notifications';
import { useTranslation } from 'react-i18next';

export const useCard = (key: string | null, options?: SWRConfiguration) => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { callUpdate, isUpdating, ...rest } = useSWRHook(
    key ? apiPaths.card(key) : null,
    'card',
    options,
  );

  return {
    ...rest,
    isUpdating: (action?: CardAction) => isUpdating(action),
    updateCard: async (update: CardUpdate) =>
      (key && (await callUpdate(() => updateCard(key, update), 'update'))) ||
      null,
    deleteCard: async () => {
      if (!key) return;
      await callUpdate(() => deleteCard(key), 'delete');
      dispatch(cardDeleted(key));
    },
    createCard: async (template: string) => {
      const result = await callUpdate(() =>
        createCard(key ?? 'root', template),
      );
      dispatch(setRecentlyCreated(result));
      return result;
    },
    moveCard: async (target: string, index?: number) =>
      key &&
      (await callUpdate(
        () =>
          updateCard(key, {
            parent: target,
            index,
          }),
        'move',
      )),

    updateWorkFlowState: async (state: string) =>
      (key &&
        (await callUpdate(
          () =>
            updateCard(key, {
              state: { name: state },
            }),
          'updateState',
        ))) ||
      null,
    createLink: async (
      target: string,
      type: string,
      linkDescription?: string,
      direction: LinkDirection = 'outbound',
    ) =>
      (key &&
        (await callUpdate(
          () =>
            createLink(
              direction === 'outbound' ? key : target,
              direction === 'outbound' ? target : key,
              type,
              linkDescription,
            ).then(() => {
              mutate(apiPaths.card(key));
            }),
          'createLink',
        ))) ||
      null,
    deleteLink: async (
      target: string,
      direction: LinkDirection,
      linkType: string,
      linkDescription?: string,
    ) =>
      (key &&
        (await callUpdate(
          () =>
            removeLink(
              direction === 'outbound' ? key : target,
              direction === 'outbound' ? target : key,
              linkType,
              linkDescription,
            ).then(() => {
              mutate(apiPaths.card(key));
            }),
          'deleteLink',
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
      return (
        (key &&
          (await callUpdate(() => {
            // Current link structure
            const sourceKey = direction === 'outbound' ? key : target;
            const destKey = direction === 'outbound' ? target : key;

            // Original link structure
            const oldDirection = previousDirection;
            const oldSourceKey =
              oldDirection === 'outbound' ? key : previousCardKey || target;
            const oldDestKey =
              oldDirection === 'outbound' ? previousCardKey || target : key;
            const oldLinkType = previousLinkType || linkType;

            return removeLink(
              oldSourceKey,
              oldDestKey,
              oldLinkType,
              previousLinkDescription,
            )
              .then(() =>
                createLink(sourceKey, destKey, linkType, linkDescription),
              )
              .then(() => mutate(apiPaths.card(key)));
          }, 'editLink'))) ||
        null
      );
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
