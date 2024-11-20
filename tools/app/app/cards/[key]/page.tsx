/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

'use client';
import { ContentArea } from '@/app/components/ContentArea';
import ContentToolbar from '@/app/components/ContentToolbar';
import LoadingGate from '@/app/components/LoadingGate';
import { cardViewed } from '@/app/lib/actions';
import { useCard, useLinkTypes, useTree } from '@/app/lib/api';
import { CardMode } from '@/app/lib/definitions';
import { useAppDispatch, useListCard, useAppRouter } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import { expandLinkTypes } from '@/app/lib/utils';
import { Box, Stack, Typography } from '@mui/joy';
import { useEffect, useState, use } from 'react';
import { useTranslation } from 'react-i18next';

export const dynamic = 'force-dynamic';

export default function Page(props: { params: Promise<{ key: string }> }) {
  const params = use(props.params);
  const { card, error, createLink, deleteLink, isLoading } = useCard(
    params.key,
  );

  const { tree } = useTree();

  const listCard = useListCard(params.key);

  const { linkTypes } = useLinkTypes();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  const { t } = useTranslation();

  const [linksVisible, setLinksVisible] = useState(false);

  useEffect(() => {
    if (listCard) {
      dispatch(
        cardViewed({
          key: listCard.key,
          children: listCard?.results?.map((c) => c.key) ?? [],
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
        cardKey={params.key}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onInsertLink={() => setLinksVisible(true)}
        linkButtonDisabled={expandedLinkTypes.length === 0}
      />
      <Box flexGrow={1} minHeight={0}>
        <LoadingGate values={[card, tree]}>
          <ContentArea
            cards={tree!}
            card={card!}
            onMetadataClick={() =>
              router.push(`/cards/${params.key}/edit?expand=true`)
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
                await createLink(
                  data.cardKey,
                  data.linkType,
                  linkType.enableLinkDescription
                    ? data.linkDescription
                    : undefined,
                  data.direction,
                );
                return true;
              } catch (error) {
                dispatch(
                  addNotification({
                    message: `Failed to create link: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'error',
                  }),
                );
                return false;
              }
            }}
            linksVisible={linksVisible}
            onLinkToggle={() => setLinksVisible(!linksVisible)}
            onDeleteLink={async (data) => {
              try {
                await deleteLink(
                  data.direction === 'outbound' ? params.key : data.key,
                  data.direction === 'outbound' ? data.key : params.key,
                  data.linkType,
                  data.linkDescription,
                );
              } catch (error) {
                dispatch(
                  addNotification({
                    message: `Failed to delete link: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
