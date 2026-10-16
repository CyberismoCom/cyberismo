// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
