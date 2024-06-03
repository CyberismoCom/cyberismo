'use client'
import { Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

export const dynamic = 'force-dynamic'

export default function CardsPage() {
  const { t } = useTranslation()
  return <Typography variant="h6">{t('selectCard')}</Typography>
}
