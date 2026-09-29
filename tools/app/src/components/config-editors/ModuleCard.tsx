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
import type { UpdatePlan } from '@cyberismo/data-handler';
import type { ProjectModule } from '@/lib/api/types';
import { moduleRow } from '@/lib/modules';

interface ModuleCardProps {
  module: ProjectModule;
  modules: ProjectModule[];
  disabled: boolean;
  isUpdating: (action?: string) => boolean;
  // Joint update plan; undefined until a check has finished.
  plan?: UpdatePlan;
  // The check failed, so the latest versions are unknown.
  checkFailed: boolean;
  onUpdate: () => void;
  onDelete: () => void;
}

export function ModuleCard({
  module,
  modules,
  disabled,
  isUpdating,
  plan,
  checkFailed,
  onUpdate,
  onDelete,
}: ModuleCardProps) {
  const { t } = useTranslation();
  const row = moduleRow(module, plan, modules);
  const prefix = module.cardKeyPrefix;
  const titleId = `module-title-${prefix}`;
  const showLatest = row.latestCompatible !== undefined && !checkFailed;

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
        {row.managedBy?.length ? (
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            {t('general.moduleManagedBy', {
              parents: row.managedBy.join(', '),
            })}
          </Typography>
        ) : null}
        {showLatest && (
          <>
            <Typography level="body-sm">
              {t('general.moduleLatestCompatible')}: {row.latestCompatible}{' '}
              {row.upToDate && (
                <Chip size="sm" color="success" variant="soft">
                  {t('general.moduleUpToDate')}
                </Chip>
              )}
            </Typography>
            {row.latestAvailable && (
              <Typography level="body-sm">
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
      {(row.actions.update || row.actions.remove) && (
        <CardActions>
          {row.actions.update && (
            <Button
              size="sm"
              variant="outlined"
              aria-label={t('general.updateModuleLabel', {
                module: module.name,
              })}
              loading={isUpdating(`update-${prefix}`)}
              disabled={isUpdating() || disabled}
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
              disabled={isUpdating(`delete-${prefix}`) || disabled}
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
