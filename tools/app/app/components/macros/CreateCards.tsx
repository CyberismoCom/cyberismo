import { useCard } from '@/app/lib/api';
import { Button } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { MacroContext } from '.';
import { useAppDispatch } from '@/app/lib/hooks';
import { addNotification } from '@/app/lib/slices/notifications';
import { useState } from 'react';

export type CreateCardsProps = {
  buttonlabel: string;
  template: string;
  cardkey?: string;
} & MacroContext;

export default function CreateCards({
  buttonlabel,
  template,
  cardkey,
  key,
}: CreateCardsProps) {
  const { t } = useTranslation();
  const { createCard, isUpdating } = useCard(cardkey || key);
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      loading={loading}
      disabled={isUpdating}
      onClick={async () => {
        try {
          setLoading(true);
          await createCard(template);
          dispatch(
            addNotification({
              message: t('macros.cardsCreated'),
              type: 'success',
            }),
          );
        } catch (e) {
          dispatch(
            addNotification({
              message: e instanceof Error ? e.message : t('macros.error'),
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
