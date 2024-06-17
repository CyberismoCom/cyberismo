import * as React from 'react'
import Image from 'next/image'
import { useTranslation } from 'react-i18next'

import { Stack, Button, Box } from '@mui/joy'

export default function AppToolbar() {
  const { t } = useTranslation()
  return (
    <Stack bgcolor="black" height="44px" direction="row" alignItems="center">
      <Box marginLeft={2} height="19px">
        <Image
          src="/static/images/cyberismo.png"
          alt="Cyberismo"
          width="102"
          height="19"
        />
      </Box>
      <Box sx={{ flexGrow: 1 }} />
      {false && <Button>{t('toolbar.newCard')}</Button>}
    </Stack>
  )
}
