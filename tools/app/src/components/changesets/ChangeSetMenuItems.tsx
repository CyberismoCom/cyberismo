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

import { ListDivider, MenuItem } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAppDispatch, useAppRouter } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import {
  switchChangeSet,
  useActiveChangeSet,
  useChangeSets,
} from '@/lib/api/changesets';

/**
 * The project menu's changeSet items: start one, review the active one,
 * switch to another, or go back to the project itself.
 */
export function ChangeSetMenuItems({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const { projectPrefix } = useParams();
  const dispatch = useAppDispatch();
  const router = useAppRouter();
  const { id } = useActiveChangeSet();
  const { changeSets } = useChangeSets();
  const others = changeSets.filter(
    (changeSet) => changeSet.status === 'active' && changeSet.id !== id,
  );

  const switchTo = async (target: string | null) => {
    if (!projectPrefix) return;
    try {
      await switchChangeSet(projectPrefix, target);
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
    <>
      <ListDivider />
      <MenuItem onClick={onStart} data-cy="startChangeSet">
        {t('changeSet.startMenu')}
      </MenuItem>
      {id && (
        <MenuItem
          onClick={() => router.push(`/projects/${projectPrefix}/changeset`)}
        >
          {t('changeSet.review')}
        </MenuItem>
      )}
      {others.map((changeSet) => (
        <MenuItem
          key={changeSet.id}
          onClick={() => void switchTo(changeSet.id)}
        >
          {t('changeSet.switchTo', { title: changeSet.title })}
        </MenuItem>
      ))}
      {id && (
        <MenuItem onClick={() => void switchTo(null)}>
          {t('changeSet.backToMain')}
        </MenuItem>
      )}
    </>
  );
}
