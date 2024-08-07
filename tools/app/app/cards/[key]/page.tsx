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
import { cardViewed } from '@/app/lib/actions';
import { useCard, useLinkTypes, useProject } from '@/app/lib/api';
import { CardMode } from '@/app/lib/definitions';
import { useAppDispatch, useListCard, useAppRouter } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import { Box, Stack } from '@mui/joy';
import { useEffect } from 'react';

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { key: string } }) {
  const { card, error, createLink } = useCard(params.key);

  const listCard = useListCard(params.key);

  const { project } = useProject();

  const { linkTypes } = useLinkTypes();

  const dispatch = useAppDispatch();

  const router = useAppRouter();

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
      />
      <Box flexGrow={1} minHeight={0}>
        <ContentArea
          card={card}
          error={error?.message}
          onMetadataClick={() =>
            router.push(`/cards/${params.key}/edit?expand=true`)
          }
          linkTypes={linkTypes}
          project={project}
          linkFormVisible={true}
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
        />
      </Box>
    </Stack>
  );
}
