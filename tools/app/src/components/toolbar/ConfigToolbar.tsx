/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Button, Breadcrumbs, Link, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { ResourceNode } from '../../lib/api/types';
import BaseToolbar from './BaseToolbar';
import { ConfigContextMenu } from '../context-menus';

interface ConfigToolbarProps {
  node: ResourceNode;
  onUpdate?: () => void;
  isUpdating?: boolean;
  enabled?: {
    delete?: boolean;
  };
}

export function ConfigToolbar({
  node,
  onUpdate,
  isUpdating = false,
  enabled,
}: ConfigToolbarProps) {
  const { t } = useTranslation();

  // Create breadcrumbs from the node path
  const breadcrumbs = (() => {
    const pathParts = node.name.split('/');

    return (
      <Breadcrumbs separator=">" size="sm">
        <Link href="/configuration" color="neutral">
          {t('configuration')}
        </Link>
        {pathParts.map((part, index) => {
          const isLast = index === pathParts.length - 1;
          if (isLast) {
            return (
              <Typography
                key={index}
                color="primary"
                fontSize="sm"
                fontWeight="lg"
              >
                {part}
              </Typography>
            );
          } else {
            // For intermediate breadcrumbs, we could make them clickable if needed
            return (
              <Typography key={index} color="neutral" fontSize="sm">
                {part}
              </Typography>
            );
          }
        })}
      </Breadcrumbs>
    );
  })();

  const actions = (
    <>
      {onUpdate && !node.readOnly && (
        <Button
          variant="solid"
          size="sm"
          aria-label="update"
          data-cy="updateButton"
          style={{ marginLeft: 8, minWidth: 80 }}
          onClick={onUpdate}
          loading={isUpdating}
          disabled={isUpdating}
        >
          {t('update')}
        </Button>
      )}
    </>
  );

  return (
    <BaseToolbar
      breadcrumbs={breadcrumbs}
      contextMenu={<ConfigContextMenu node={node} enabled={enabled} />}
      actions={actions}
    />
  );
}

export default ConfigToolbar;
