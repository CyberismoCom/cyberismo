'use client'
import { Typography } from '@mui/joy'
import { useTranslation } from 'react-i18next'
import { useProject } from '../lib/api'

export const dynamic = 'force-dynamic'

export default function CardsPage() {
  const { t } = useTranslation()
  const { project } = useProject()
  return <Typography variant="h6">{project && project.cards.length > 0 ? t('selectCard') : t('emptyProject')}</Typography>
}
