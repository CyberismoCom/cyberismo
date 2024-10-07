/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import * as React from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';

import { Stack, Button, Box, Typography } from '@mui/joy';
import Link from 'next/link';

interface AppToolbarProps {
  onNewCard: () => void;
}

export default function AppToolbar({ onNewCard }: AppToolbarProps) {
  const { t } = useTranslation();
  return (
    <Stack bgcolor="black" height="44px" direction="row" alignItems="center">
      <Box marginLeft={2} height="19px">
        <Link href="/cards">
          <Image
            src="/static/images/cyberismo.png"
            alt="Cyberismo"
            width="102"
            height="19"
          />
        </Link>
      </Box>
      <Box sx={{ flexGrow: 1 }} />
      <Button
        data-cy="createNewCardButton"
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
