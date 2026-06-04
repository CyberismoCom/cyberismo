/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useTranslation } from 'react-i18next';
import { Fragment } from 'react';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router';

import {
  Stack,
  Button,
  Box,
  Dropdown,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  Tooltip,
} from '@mui/joy';
import {
  useIsInCards,
  useKeyboardShortcut,
  useConfigTemplateCreationContext,
} from '@/lib/hooks';
import { UserRole, useHasMinRole } from '@/lib/auth';
import type { ResourceName } from '@/lib/constants';
import { RESOURCES } from '@/lib/constants';
import { ThemeModeToggle } from './ThemeModeToggle';
import UserMenu from './UserMenu';

interface AppToolbarProps {
  onCreate: (resourceType?: ResourceName) => void;
  onMenuClick?: () => void;
}

export function CreateButton({
  onClick,
  type,
}: {
  onClick: (resourceType?: ResourceName) => void;
  type: 'Resource' | 'Card';
}) {
  const { t } = useTranslation();
  const { showTemplateCard } = useConfigTemplateCreationContext();
  const templateCardDisabled = !showTemplateCard;

  if (type === 'Card') {
    return (
      <Button
        variant="solid"
        data-cy="createNewButton"
        size="sm"
        startDecorator={<AddIcon />}
        aria-label={t('toolbar.newCard')}
        sx={{
          marginRight: '16px',
          '--Button-gap': { xs: 0, sm: '0.375rem' },
        }}
        onClick={() => onClick()}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {t('toolbar.newCard')}
        </Box>
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
          <Fragment key={resource}>
            <MenuItem onClick={() => onClick(resource)}>
              {t(`newResourceModal.${resource}.name`)}
            </MenuItem>
            {resource === 'templates' && (
              <Tooltip
                title={
                  templateCardDisabled
                    ? t('templateCardDisabledTooltip')
                    : undefined
                }
                placement="left"
                disableHoverListener={!templateCardDisabled}
              >
                <span>
                  <MenuItem
                    disabled={templateCardDisabled}
                    onClick={() =>
                      !templateCardDisabled &&
                      onClick('templateCard' as ResourceName)
                    }
                  >
                    {t('templateCard')}
                  </MenuItem>
                </span>
              </Tooltip>
            )}
          </Fragment>
        ))}
      </Menu>
    </Dropdown>
  );
}

export default function AppToolbar({ onCreate, onMenuClick }: AppToolbarProps) {
  const { t } = useTranslation();
  const inCards = useIsInCards();
  const canEdit = useHasMinRole(UserRole.Editor);
  const isAdmin = useHasMinRole(UserRole.Admin);
  const canCreate = inCards ? canEdit : isAdmin;
  useKeyboardShortcut(
    {
      key: 'c',
    },
    () => {
      if (canCreate) {
        onCreate();
      }
    },
  );
  return (
    <Stack
      bgcolor="neutral.900"
      height="44px"
      direction="row"
      alignItems="center"
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {inCards && onMenuClick && (
        <IconButton
          variant="plain"
          color="neutral"
          size="sm"
          onClick={onMenuClick}
          aria-label={t('toolbar.openMenu')}
          sx={{ display: { xs: 'inline-flex', md: 'none' }, ml: 1 }}
        >
          <MenuIcon />
        </IconButton>
      )}
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
      <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
        <ThemeModeToggle />
      </Box>
      {canCreate && (
        <CreateButton type={inCards ? 'Card' : 'Resource'} onClick={onCreate} />
      )}
      <UserMenu />
    </Stack>
  );
}
