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

import { Stack } from '@mui/joy';
import ConfigToolbar from '../toolbar/ConfigToolbar';
import type { AnyNode } from '@/lib/api/types';

export default function BaseEditor({
  node,
  children,
  onUpdate,
  onCancel,
  loading,
  enabled,
  isDirty = true,
}: {
  node: AnyNode;
  onUpdate?: () => void;
  onCancel?: () => void;
  children: React.ReactNode;
  enabled?: {
    delete?: boolean;
    logicProgram?: boolean;
  };
  loading?: boolean;
  isDirty?: boolean;
}) {
  return (
    <Stack height="100%">
      <ConfigToolbar
        node={node}
        onUpdate={onUpdate}
        onCancel={onCancel}
        loading={loading}
        disabled={node.readOnly || !isDirty}
        enabled={enabled}
      />
      <Stack flexGrow={1} minHeight={0} padding={3} sx={{ overflow: 'auto' }}>
        {children}
      </Stack>
    </Stack>
  );
}
