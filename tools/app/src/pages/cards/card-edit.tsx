import { useRequiredKeyParam } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { useCard } from '@/lib/api';
import { Box } from '@mui/joy';
import CardEditor from '@/components/CardEditor';
import { useAppRouter } from '@/lib/hooks';

export default function CardEdit() {
  const key = useRequiredKeyParam();
  const { t } = useTranslation();
  const { isLoading, error } = useCard(key);
  const router = useAppRouter();

  if (isLoading) {
    return <Box>{t('loading')}</Box>;
  }
  if (error) {
    return <Box>{t('failedToLoad')}</Box>;
  }
  return (
    <CardEditor
      cardKey={key}
      afterSave={() => {
        router.push(`/cards/${key}`);
      }}
    />
  );
}
