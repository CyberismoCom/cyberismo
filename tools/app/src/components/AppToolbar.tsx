/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link } from 'react-router';

import {
  Stack,
  Button,
  Box,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
} from '@mui/joy';
import { config } from '@/lib/utils';
import { useIsInCards, useKeyboardShortcut } from '@/lib/hooks';
import { ResourceName, RESOURCES } from '@/lib/constants';

interface AppToolbarProps {
  onCreate: (resourceType?: ResourceName) => void;
}

export function CreateButton({
  onClick,
  type,
}: {
  onClick: (resourceType?: ResourceName) => void;
  type: 'Resource' | 'Card';
}) {
  const { t } = useTranslation();

  if (type === 'Card') {
    return (
      <Button
        variant="solid"
        data-cy="createNewButton"
        size="sm"
        startDecorator={<AddIcon />}
        sx={{ marginRight: '16px' }}
        onClick={() => onClick()}
      >
        {t('toolbar.newCard')}
      </Button>
    );
  }

  return (
    <Dropdown>
      <MenuButton
        variant="solid"
        size="sm"
        endDecorator={<ExpandMoreIcon />}
        sx={{ marginRight: '16px' }}
        color="primary"
      >
        {t('toolbar.newResource')}
      </MenuButton>
      <Menu>
        {RESOURCES.map((resource) => (
          <MenuItem key={resource} onClick={() => onClick(resource)}>
            {t(`newResourceModal.${resource}.name`)}
          </MenuItem>
        ))}
      </Menu>
    </Dropdown>
  );
}

export default function AppToolbar({ onCreate }: AppToolbarProps) {
  const inCards = useIsInCards();
  useKeyboardShortcut(
    {
      key: 'c',
    },
    () => {
      if (!config.staticMode) {
        onCreate();
      }
    },
  );
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
      {!config.staticMode && (
        <CreateButton type={inCards ? 'Card' : 'Resource'} onClick={onCreate} />
      )}
    </Stack>
  );
}
