/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import CallSplitIcon from '@mui/icons-material/CallSplit';
import {
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAppDispatch, useAppRouter } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { switchChangeSet, useActiveChangeSet } from '@/lib/api/changesets';

/**
 * Shown in the toolbar while the user works in a changeSet: every change
 * goes there instead of the project, so this is never out of sight.
 */
export function ChangeSetIndicator() {
  const { t } = useTranslation();
  const { projectPrefix } = useParams();
  const dispatch = useAppDispatch();
  const router = useAppRouter();
  const { id, changeSet } = useActiveChangeSet();
  if (!id) return null;
  const title = changeSet?.title ?? '';

  const backToMain = async () => {
    if (!projectPrefix) return;
    try {
      await switchChangeSet(projectPrefix, null);
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : String(error),
          type: 'error',
        }),
      );
    }
  };

  return (
    <Dropdown>
      <Tooltip title={t('changeSet.indicatorTooltip', { title })}>
        <MenuButton
          size="sm"
          variant="soft"
          color="warning"
          startDecorator={<CallSplitIcon />}
          data-cy="changeSetIndicator"
          sx={{ mr: 2, maxWidth: { xs: 140, sm: 280 } }}
        >
          <Typography level="body-sm" noWrap textColor="inherit">
            {title}
          </Typography>
        </MenuButton>
      </Tooltip>
      <Menu placement="bottom-end">
        <MenuItem
          onClick={() => router.push(`/projects/${projectPrefix}/changeset`)}
        >
          {t('changeSet.review')}
        </MenuItem>
        <MenuItem onClick={() => void backToMain()}>
          {t('changeSet.backToMain')}
        </MenuItem>
      </Menu>
    </Dropdown>
  );
}
