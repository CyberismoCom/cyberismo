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

export type CreateCardsProps = {
  buttonlabel: string;
  template: string;
  cardKey?: string;
} & MacroContext;

export default function CreateCards({
  buttonlabel,
  template,
  cardKey,
  macroKey,
  preview,
}: CreateCardsProps) {
  const { t } = useTranslation();
  const { createCard, isUpdating } = useCard(cardKey || macroKey);
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
            router.push(`/cards/${cards[0]}`);
          }
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
      {buttonlabel}
    </Button>
  );
}
