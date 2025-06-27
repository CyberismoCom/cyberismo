/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { ContentArea, LinkFormState } from '@/components/ContentArea';
import ContentToolbar from '@/components/ContentToolbar';
import LoadingGate from '@/components/LoadingGate';
import { cardViewed } from '@/lib/actions';
import { useCard, useLinkTypes, useTree } from '@/lib/api';
import { CardMode } from '@/lib/definitions';
import {
  useAppDispatch,
  useListCard,
  useAppRouter,
  useKeyboardShortcut,
} from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { expandLinkTypes } from '@/lib/utils';
import { Box, Stack, Typography } from '@mui/joy';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRequiredKeyParam } from '@/lib/hooks';

export const dynamic = 'force-dynamic';

export default function Page() {
  // use params from the url, it should always have a key
  const key = useRequiredKeyParam();

  const { card, error, createLink, deleteLink, editLink } = useCard(key);

  const { tree } = useTree();

  const listCard = useListCard(key);

  const { linkTypes } = useLinkTypes();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  useKeyboardShortcut(
    {
      key: 'e',
    },
    () => router.safePush(`/cards/${key}/edit`),
  );

  const { t } = useTranslation();

  const [linkFormState, setLinkFormState] = useState<LinkFormState>('hidden');

  useEffect(() => {
    if (listCard) {
      dispatch(
        cardViewed({
          key: listCard.key,
          children: listCard?.children?.map((c) => c.key) ?? [],
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }, [listCard, dispatch]);

  if (error) {
    let errorMessage = t('unknownError');
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return <Typography level="title-md">{errorMessage}</Typography>;
  }

  const expandedLinkTypes =
    linkTypes && card?.cardType
      ? expandLinkTypes(linkTypes, card?.cardType || '')
      : [];

  return (
    <Stack height="100%">
      <ContentToolbar
        cardKey={key}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onInsertLink={() => setLinkFormState('add-from-toolbar')}
        linkButtonDisabled={expandedLinkTypes.length === 0}
      />
      <Box flexGrow={1} minHeight={0}>
        <LoadingGate values={[card, tree]}>
          <ContentArea
            cards={tree!}
            card={card!}
            onMetadataClick={() =>
              router.push(`/cards/${key}/edit?expand=true`)
            }
            linkTypes={expandedLinkTypes}
            onLinkFormSubmit={async (data) => {
              try {
                const linkType = linkTypes?.find(
                  (lt) => lt.name === data.linkType,
                );
                if (!linkType) {
                  throw new Error('Link type not found');
                }

                // Handle both regular form and modal form submissions
                if (
                  data.previousLinkDescription !== undefined &&
                  data.previousLinkType !== undefined &&
                  data.previousCardKey !== undefined &&
                  data.previousDirection !== undefined
                ) {
                  // This is coming from edit link modal
                  await editLink(
                    data.cardKey,
                    data.direction,
                    data.linkType,
                    data.previousLinkType,
                    data.previousCardKey,
                    data.previousDirection,
                    linkType.enableLinkDescription
                      ? data.linkDescription
                      : undefined,
                    data.previousLinkDescription,
                  );
                  return true;
                } else {
                  // This is a new link creation
                  await createLink(
                    data.cardKey,
                    data.linkType,
                    linkType.enableLinkDescription
                      ? data.linkDescription
                      : undefined,
                    data.direction,
                  );
                  setLinkFormState('hidden');
                  return true;
                }
              } catch (error) {
                dispatch(
                  addNotification({
                    message: error instanceof Error ? error.message : '',
                    type: 'error',
                  }),
                );
                return false;
              }
            }}
            linkFormState={linkFormState}
            onLinkFormChange={(state) => setLinkFormState(state)}
            onDeleteLink={async (data) => {
              try {
                await deleteLink(
                  data.key,
                  data.direction,
                  data.linkType,
                  data.linkDescription,
                );
              } catch (error) {
                dispatch(
                  addNotification({
                    message: error instanceof Error ? error.message : '',
                    type: 'error',
                  }),
                );
              }
            }}
          />
        </LoadingGate>
      </Box>
    </Stack>
  );
}
