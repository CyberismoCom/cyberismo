/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { ProjectModule } from '@/lib/api/types';
import type { ModuleRow } from '@/lib/modules';

interface ModuleCardProps {
  module: ProjectModule;
  row: ModuleRow;
  disabled: boolean;
  // A version check is running; changes wait for it.
  checking: boolean;
  isUpdating: (action?: string) => boolean;
  onUpdate: () => void;
  onDelete: () => void;
}

export function ModuleCard({
  module,
  row,
  disabled,
  checking,
  isUpdating,
  onUpdate,
  onDelete,
}: ModuleCardProps) {
  const { t } = useTranslation();
  const prefix = module.cardKeyPrefix;
  const titleId = `module-title-${prefix}`;
  const busy = isUpdating() || checking || disabled;

  return (
    <Card size="sm" variant="outlined" role="group" aria-labelledby={titleId}>
      <CardContent>
        <Typography level="title-sm" id={titleId}>
          {module.name}
        </Typography>
        <Typography level="body-sm">
          {t('general.cardKeyPrefix')}: {prefix}
        </Typography>
        {module.installedVersion && (
          <Typography level="body-sm">
            {t('general.moduleInstalledVersion')}: {module.installedVersion}
          </Typography>
        )}
        {module.declaredRange && (
          <Typography level="body-sm">
            {t('general.moduleVersionRange')}: {module.declaredRange}
          </Typography>
        )}
        {row.assumedRange && (
          <Typography level="body-sm">
            {t('general.moduleAssumedRange')}: {row.assumedRange}
          </Typography>
        )}
        {row.managedBy?.length ? (
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            {t('general.moduleManagedBy', {
              parents: row.managedBy.join(', '),
            })}
          </Typography>
        ) : null}
        {row.latestCompatible != null && (
          <>
            <Typography level="body-sm" component="div">
              {t('general.moduleLatestCompatible')}: {row.latestCompatible}{' '}
              {row.upToDate && (
                <Chip size="sm" color="success" variant="soft">
                  {t('general.moduleUpToDate')}
                </Chip>
              )}
            </Typography>
            {row.latestAvailable && (
              <Typography level="body-sm" component="div">
                {t('general.moduleLatestAvailable')}: {row.latestAvailable}{' '}
                {row.heldBack && (
                  <Chip size="sm" color="warning" variant="soft">
                    {t('general.moduleHeldBack')}
                  </Chip>
                )}
              </Typography>
            )}
          </>
        )}
      </CardContent>
      {row.hasActions && (
        <CardActions>
          {row.actions.update && (
            <Button
              size="sm"
              variant="outlined"
              aria-label={t('general.updateModuleLabel', {
                module: module.name,
              })}
              loading={isUpdating(`update-${prefix}`)}
              disabled={busy}
              onClick={onUpdate}
            >
              {t('update')}
            </Button>
          )}
          {row.actions.remove && (
            <Button
              size="sm"
              variant="outlined"
              color="danger"
              aria-label={t('general.deleteModuleLabel', {
                module: module.name,
              })}
              loading={isUpdating(`delete-${prefix}`)}
              disabled={busy}
              onClick={onDelete}
            >
              {t('delete')}
            </Button>
          )}
        </CardActions>
      )}
    </Card>
  );
}

export default ModuleCard;
