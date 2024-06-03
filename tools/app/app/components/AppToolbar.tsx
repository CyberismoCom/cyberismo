import * as React from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Image from 'next/image'
import Button from '@mui/material/Button'
import { useTranslation } from 'react-i18next'

export default function AppToolbar() {
  const { t } = useTranslation()
  return (
    <AppBar position="sticky" style={{ background: '#000000' }}>
      <Toolbar>
        <Image
          src="/static/images/cyberismo.png"
          alt="Cyberismo"
          width="102"
          height="19"
        />
        <Typography
          fontSize={18}
          color="#F3EDE3"
          component="div"
          sx={{ flexGrow: 1, marginLeft: 1 }}
        >
          {t('appName')}
        </Typography>
        <Button color="inherit">{t('toolbar.newCard')}</Button>
        <Button color="inherit">{t('toolbar.importModules')}</Button>
      </Toolbar>
    </AppBar>
  )
}
