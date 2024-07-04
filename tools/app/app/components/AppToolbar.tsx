import * as React from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';

import { Stack, Button, Box, Typography } from '@mui/joy';

interface AppToolbarProps {
  onNewCard: () => void;
}

export default function AppToolbar({ onNewCard }: AppToolbarProps) {
  const { t } = useTranslation();
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
      <Button
        variant="plain"
        sx={{
          bgcolor: 'black',
          '&:hover': {
            bgcolor: 'black',
          },
        }}
        onClick={onNewCard}
      >
        <Typography
          level="title-sm"
          sx={{
            color: 'white',
          }}
        >
          {t('toolbar.newCard')}
        </Typography>
      </Button>
    </Stack>
  );
}
