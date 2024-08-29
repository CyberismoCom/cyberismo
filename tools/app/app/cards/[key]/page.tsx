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
import { useCard, useLinkTypes, useProject } from '@/app/lib/api';
import { CardMode } from '@/app/lib/definitions';
import { useAppDispatch, useListCard, useAppRouter } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import { Box, Stack } from '@mui/joy';
import { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { key: string } }) {
  const { card, error, createLink, deleteLink } = useCard(params.key);

  const listCard = useListCard(params.key);

  const { project } = useProject();

  const { linkTypes } = useLinkTypes();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

  const [linksVisible, setLinksVisible] = useState(false);

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

  return (
    <Stack height="100%">
      <ContentToolbar
        cardKey={params.key}
        mode={CardMode.VIEW}
        onUpdate={() => {}}
        onInsertLink={() => setLinksVisible(true)}
      />
      <Box flexGrow={1} minHeight={0}>
        <LoadingGate values={[card, linkTypes]}>
          <ContentArea
            card={card!}
            onMetadataClick={() =>
              router.push(`/cards/${params.key}/edit?expand=true`)
            }
            linkTypes={linkTypes!}
            project={project}
            onLinkFormSubmit={async (data) => {
              try {
                await createLink(
                  data.cardKey,
                  data.linkType,
                  data.linkDescription,
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
                  data.fromCard,
                  data.cardKey,
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
