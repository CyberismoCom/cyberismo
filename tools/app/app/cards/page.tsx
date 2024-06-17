'use client'
import { Typography } from '@mui/joy'
import { useTranslation } from 'react-i18next'

export const dynamic = 'force-dynamic'

export default function CardsPage() {
  const { t } = useTranslation()
  return <Typography level="title-md">{t('selectCard')}</Typography>
}
