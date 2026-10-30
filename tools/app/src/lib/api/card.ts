// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { downloadBlob } from '@/lib/utils';
import { callApi, projectApiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';
import { mutate } from 'swr';
import type { CardUpdate, CardView } from './types';
import { useAppDispatch, useUpdating } from '../hooks';
import { cardDeleted } from '../actions';
import { createLink, removeLink, updateLink } from './actions';
import type { LinkDirection, Card, QueryResult } from '@cyberismo/model';
import type { CardAction } from './action-types';
import { setRecentlyCreated } from '../slices/card';
import { addNotification, removeNotification } from '../slices/notifications';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

const useCardData = (
  key: string | null,
  options?: SWRConfiguration,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const {
    // TODO: get rid of these functions from useSWRHook
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    callUpdate: _callUpdate,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isUpdating: _isUpdating,
    ...rest
  } = useSWRHook(key ? apiPaths.card(key) : null, 'card', null, options);

  return rest;
};

export type CardData = ReturnType<typeof useCardData>;

export const useCardContent = (
  key: string | null,
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook(
    key ? projectApiPaths(projectPrefix).cardContent(key) : null,
    'cardContent',
    null,
    options,
  );

export const useCardSource = (
  key: string | null,
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook(
    key ? projectApiPaths(projectPrefix).cardSource(key) : null,
    'cardSource',
    null,
    options,
  );

/** Joins the three card reads into what the card view renders. */
export function toCardView(
  data: QueryResult<'card'> | null,
  content: { adocContent: string } | null,
  source: Card | null,
): CardView | null {
  return data && content && source
    ? {
        ...data,
        adocContent: content.adocContent,
        rawContent: source.content ?? '',
        attachments: source.attachments,
        path: source.path,
      }
    : null;
}

// replaced in U4
export const useRawCard = (key: string | null, options?: SWRConfiguration) => {
  const data = useCardData(key, options);
  const content = useCardContent(key, options);
  const source = useCardSource(key, options);
  const card = useMemo(
    () => toCardView(data.card, content.cardContent, source.cardSource),
    [data.card, content.cardContent, source.cardSource],
  );
  return {
    ...data,
    card,
    isLoading: data.isLoading || content.isLoading || source.isLoading,
    error: data.error ?? content.error ?? source.error,
  };
};

export const useCardMutations = (
  key: string | null,
  projectPrefix?: string,
) => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const apiPaths = projectApiPaths(projectPrefix);

  // since writes and reads are separate, we can use apiPath.card here
  const swrKey = key ? apiPaths.card(key) : null;
  const { isUpdating, call } = useUpdating(swrKey);

  return {
    isUpdating: (action?: CardAction) => isUpdating(action),
    updateCard: async (update: CardUpdate) =>
      (key && (await call(() => updateCard(key, update), 'update'))) || null,
    deleteCard: async () => {
      if (!key) return;
      try {
        await call(() => deleteCard(key), 'delete');
        dispatch(cardDeleted(key));
        dispatch(
          addNotification({
            message: t('deleteCardSuccess'),
            type: 'success',
          }),
        );
        return true;
      } catch (error) {
        dispatch(
          addNotification({
            message: error instanceof Error ? error.message : '',
            type: 'error',
          }),
        );
        return false;
      }
    },
    createCard: async (template: string, parentKey?: string) => {
      const result = await call(() =>
        createCard(parentKey ?? key ?? 'root', template),
      );
      dispatch(setRecentlyCreated(result.map((card) => card.key)));
      return result;
    },
    moveCard: async (target: string, index?: number) =>
      key &&
      (await call(
        () =>
          updateCard(key, {
            parent: target,
            index,
          }),
        'move',
      )),

    updateWorkFlowState: async (state: string) =>
      (key &&
        (await call(
          () =>
            updateCard(key, {
              state,
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
        (await call(
          () =>
            createLink(key, target, type, linkDescription, direction).then(() =>
              revalidateCardView(key, projectPrefix),
            ),
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
        (await call(
          () =>
            removeLink(key, target, linkType, linkDescription, direction).then(
              () => revalidateCardView(key, projectPrefix),
            ),
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
          (await call(() => {
            return updateLink(
              key,
              target,
              linkType,
              direction,
              previousCardKey,
              previousLinkType || linkType,
              previousDirection,
              linkDescription,
              previousLinkDescription,
            ).then(() => revalidateCardView(key, projectPrefix));
          }, 'editLink'))) ||
        null
      );
    },
  };
};

export const useCardExport = (projectPrefix?: string) => {
  const dispatch = useAppDispatch();
  return {
    exportCard: (params: ExportCardParams) =>
      exportCard(params, dispatch, projectPrefix),
  };
};

export const useCard = (key: string | null, options?: SWRConfiguration) => {
  const cardData = useCardData(key, options);
  const mutations = useCardMutations(key);
  // TODO: Separate read from write methods
  // This function is just for compatibility

  return { ...cardData, ...mutations };
};

// Links show in the card data and, through macros, in the rendered content.
function revalidateCardView(key: string, projectPrefix?: string) {
  const apiPaths = projectApiPaths(projectPrefix);
  return Promise.all([
    mutate(apiPaths.card(key)),
    mutate(apiPaths.cardContent(key)),
  ]);
}

export async function updateCard(
  key: string,
  cardUpdate: CardUpdate,
  projectPrefix?: string,
) {
  const apiPaths = projectApiPaths(projectPrefix);
  const swrKey = apiPaths.card(key);
  const result = await callApi<QueryResult<'card'>>(
    swrKey,
    'PATCH',
    cardUpdate,
  );

  mutate(swrKey, result, false);
  const bodyRefetch = Promise.all([
    mutate(apiPaths.cardContent(key)),
    mutate(apiPaths.cardSource(key)),
  ]);

  mutate(apiPaths.tree());
  // Template-card moves/ranks also affect the configuration tree.
  mutate(apiPaths.resourceTree());

  // The editor leaves edit mode on resolve; the new body must be in by then.
  if (cardUpdate.content != null) {
    await bodyRefetch;
  }
}

export async function deleteCard(key: string, projectPrefix?: string) {
  const apiPaths = projectApiPaths(projectPrefix);
  const swrKey = apiPaths.card(key);
  await callApi(swrKey, 'DELETE');

  mutate(swrKey, undefined, false);
  mutate(apiPaths.cardContent(key), undefined, false);
  mutate(apiPaths.cardSource(key), undefined, false);

  mutate(apiPaths.tree());
  // Template-card deletes also affect the configuration tree.
  mutate(apiPaths.resourceTree());
}

export async function createCard(
  parentKey: string,
  template: string,
  projectPrefix?: string,
): Promise<Card[]> {
  const apiPaths = projectApiPaths(projectPrefix);
  const result = await callApi<Card[]>(apiPaths.card(parentKey), 'POST', {
    template,
  });

  // revalidate whole project
  mutate(apiPaths.tree());

  return result;
}

type ExportCardParams = {
  cardKey: string;
  title: string;
  name: string;
  exportChildCards: boolean;
  version?: string;
};
async function exportCard(
  { cardKey, title, exportChildCards, name, version }: ExportCardParams,
  dispatch: ReturnType<typeof useAppDispatch>,
  projectPrefix?: string,
) {
  const apiPaths = projectApiPaths(projectPrefix);
  const progressNotification = dispatch(
    addNotification({
      message: `Exporting ${title} to PDF...`,
      type: 'info',
      disableAutoClose: true,
    }),
  );
  try {
    const blob = await callApi<Blob>(
      apiPaths.exportCard(),
      'POST',
      {
        cardKey,
        title,
        exportChildCards,
        name,
        ...(version && { version }),
      },
      { responseType: 'blob' },
    );
    downloadBlob(blob, `${name}.pdf`);
    dispatch(removeNotification(progressNotification.payload.id));
    dispatch(
      addNotification({
        message: `Successfully exported card to PDF (${name}.pdf)`,
        type: 'success',
      }),
    );
    return true;
  } catch (error) {
    dispatch(removeNotification(progressNotification.payload.id));
    dispatch(
      addNotification({
        message: error instanceof Error ? error.message : '',
        type: 'error',
      }),
    );
    return false;
  }
}
