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

import { Avatar, Dropdown, Menu, MenuButton, Typography, Box } from '@mui/joy';
import { useUser } from '@/lib/api';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function UserMenu() {
  const { user } = useUser();

  if (!user) return null;

  const initials = getInitials(user.name) || '?';

  return (
    <Dropdown>
      <MenuButton
        slots={{ root: Avatar }}
        slotProps={{
          root: {
            size: 'sm',
            sx: {
              cursor: 'pointer',
              fontSize: '0.75rem',
              bgcolor: 'primary.500',
              color: 'white',
              marginRight: 1,
            },
          },
        }}
      >
        {initials}
      </MenuButton>
      <Menu placement="bottom-end" sx={{ minWidth: 200 }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography level="title-sm">{user.name}</Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            {user.email}
          </Typography>
        </Box>
      </Menu>
    </Dropdown>
  );
}
