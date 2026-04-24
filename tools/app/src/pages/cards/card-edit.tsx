import { Navigate } from 'react-router';
import { useRequiredKeyParam } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { useCard } from '@/lib/api';
import { Box } from '@mui/joy';
import CardEditor from '@/components/CardEditor';
import { useAppRouter } from '@/lib/hooks';
import { useCanEdit } from '@/lib/auth';

export default function CardEdit() {
  const key = useRequiredKeyParam();
  const { t } = useTranslation();
  const cardData = useCard(key);
  const router = useAppRouter();
  const canEdit = useCanEdit();

  if (cardData.isLoading) {
    return <Box>{t('loading')}</Box>;
  }
  if (cardData.error) {
    return <Box>{t('failedToLoad')}</Box>;
  }
  if (!canEdit) {
    return <Navigate to={`/cards/${key}`} replace />;
  }
  return (
    <CardEditor
      cardKey={key}
      afterSave={() => {
        router.push(`/cards/${key}`);
      }}
      onCancel={() => router.safePush(`/cards/${key}`)}
      cardData={cardData}
    />
  );
}
