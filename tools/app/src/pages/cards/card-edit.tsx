import { useRequiredKeyParam, useParentCard } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { useCard } from '@/lib/api';
import { Box } from '@mui/joy';
import CardEditor from '@/components/CardEditor';
import { useAppRouter } from '@/lib/hooks';

export default function CardEdit() {
  const key = useRequiredKeyParam();
  const { t } = useTranslation();
  const cardData = useCard(key);
  const router = useAppRouter();
  const parent = useParentCard(key);

  if (cardData.isLoading) {
    return <Box>{t('loading')}</Box>;
  }
  if (cardData.error) {
    return <Box>{t('failedToLoad')}</Box>;
  }
  return (
    <CardEditor
      cardKey={key}
      afterSave={() => {
        router.push(`/cards/${key}`);
      }}
      afterDelete={() =>
        router.push(parent ? `/cards/${parent.key}` : '/cards')
      }
      onCancel={() => router.safePush(`/cards/${key}`)}
      cardData={cardData}
    />
  );
}
