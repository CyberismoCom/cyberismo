/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useCard } from '@/lib/api';
import { Button } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { MacroContext } from '.';
import { useAppDispatch, useAppRouter } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { useState } from 'react';
import { LinkDirection } from '@cyberismo/data-handler/types/queries';

export type CreateCardsProps = {
  buttonLabel: string;
  template: string;
  cardKey?: string;
  link?: {
    linkType: string;
    direction: LinkDirection;
    cardKey: string;
    description?: string;
  };
} & MacroContext;

export default function CreateCards({
  buttonLabel,
  template,
  cardKey,
  macroKey,
  preview,
  link,
}: CreateCardsProps) {
  const { t } = useTranslation();
  const { createCard, isUpdating } = useCard(cardKey || macroKey);
  const { createLink } = useCard(link?.cardKey || null);
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const router = useAppRouter();

  return (
    <Button
      loading={loading}
      disabled={isUpdating()}
      onClick={async () => {
        try {
          if (preview) {
            dispatch(
              addNotification({
                message: t('createCard.macro.preview'),
                type: 'success',
              }),
            );
            return;
          }
          setLoading(true);
          const cards = await createCard(template);
          dispatch(
            addNotification({
              message: t('createCard.success'),
              type: 'success',
            }),
          );

          if (cards && cards.length > 0) {
            if (link) {
              const rootCards = cards.filter((card) => card.parent === 'root');
              if (rootCards.length > 0) {
                try {
                  const linkResults = await Promise.allSettled(
                    rootCards.map((card) =>
                      createLink(
                        card.key,
                        link.linkType,
                        link.description,
                        link.direction,
                      ),
                    ),
                  );

                  const successful = linkResults.filter(
                    (result) => result.status === 'fulfilled',
                  ).length;
                  const failed = linkResults.filter(
                    (result) => result.status === 'rejected',
                  ).length;

                  if (successful > 0) {
                    dispatch(
                      addNotification({
                        message: t('createLink.success', { count: successful }),
                        type: 'success',
                      }),
                    );
                  }

                  if (failed > 0) {
                    dispatch(
                      addNotification({
                        message: t('createLink.partialFailure', {
                          count: failed,
                        }),
                        type: 'error',
                      }),
                    );
                  }
                } catch (e) {
                  dispatch(
                    addNotification({
                      message:
                        e instanceof Error ? e.message : t('unknownError'),
                      type: 'error',
                    }),
                  );
                }
              }
            }
          }
          router.push(`/cards/${cards[0].key}`);
        } catch (e) {
          dispatch(
            addNotification({
              message: e instanceof Error ? e.message : t('unknownError'),
              type: 'error',
            }),
          );
        } finally {
          setLoading(false);
        }
      }}
    >
      {buttonLabel}
    </Button>
  );
}
