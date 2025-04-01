/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import { Link } from 'react-router';

import { Stack, Button, Box, Typography } from '@mui/joy';

interface AppToolbarProps {
  onNewCard: () => void;
}

export default function AppToolbar({ onNewCard }: AppToolbarProps) {
  const { t } = useTranslation();
  return (
    <Stack bgcolor="black" height="44px" direction="row" alignItems="center">
      <Box marginLeft={2} height="19px">
        <Link to="/cards">
          <img
            src="/images/cyberismo.png"
            alt="Cyberismo"
            width="102"
            height="19"
          />
        </Link>
      </Box>
      <Box sx={{ flexGrow: 1 }} />
      <Button
        data-cy="createNewCardButton"
        variant="solid"
        size="sm"
        startDecorator={<AddIcon />}
        sx={{ marginRight: '16px' }}
        onClick={onNewCard}
      >
        {t('toolbar.newCard')}
      </Button>
    </Stack>
  );
}
