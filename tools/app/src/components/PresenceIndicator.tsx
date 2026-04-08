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

import { Chip, Stack, Tooltip, Typography } from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useTranslation } from 'react-i18next';
import type { PresenceEntry } from '@/lib/api/presence';
import { getInitials } from '@/lib/utils';

const MAX_VISIBLE = 2;

const groups = [
  {
    mode: 'editing',
    color: 'warning',
    icon: <EditIcon sx={{ fontSize: 14 }} />,
  },
  {
    mode: 'viewing',
    color: 'neutral',
    icon: <VisibilityIcon sx={{ fontSize: 14 }} />,
  },
] as const;

interface PresenceIndicatorProps {
  presence: PresenceEntry[];
  currentUserId?: string;
}

export default function PresenceIndicator({
  presence,
  currentUserId,
}: PresenceIndicatorProps) {
  const { t } = useTranslation();

  const others = currentUserId
    ? presence.filter((e) => e.userId !== currentUserId)
    : presence;

  if (others.length === 0) return null;

  return (
    <Stack direction="row" gap={1} alignItems="center" sx={{ mx: 1 }}>
      {groups.map(({ mode, color, icon }) => {
        const users = others.filter((e) => e.mode === mode);
        if (users.length === 0) return null;
        const visible = users.slice(0, MAX_VISIBLE);
        const hiddenCount = users.length - MAX_VISIBLE;
        const tooltip = t(`presence.${mode}`, {
          names: users.map((e) => e.userName).join(', '),
        });

        return (
          <Tooltip
            key={mode}
            title={tooltip}
            placement="bottom"
            sx={{ whiteSpace: 'pre-line' }}
          >
            <Chip size="sm" variant="soft" color={color} endDecorator={icon}>
              <Stack direction="row" gap={0.5}>
                {visible.map((user) => (
                  <Typography
                    key={user.userId}
                    level="body-xs"
                    component="span"
                    sx={{ fontWeight: 600 }}
                  >
                    {getInitials(user.userName)}
                  </Typography>
                ))}
                {hiddenCount > 0 && (
                  <Typography
                    level="body-xs"
                    component="span"
                    sx={{ fontWeight: 600 }}
                  >
                    +{hiddenCount}
                  </Typography>
                )}
              </Stack>
            </Chip>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
