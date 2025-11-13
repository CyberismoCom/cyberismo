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

import CodeMirror from '@uiw/react-codemirror';
import type { FileNode } from '@/lib/api/types';
import { useEffect, useState } from 'react';
import BaseEditor from './BaseEditor';
import { addNotification } from '@/lib/slices/notifications';
import { useAppDispatch } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { CODE_MIRROR_BASE_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import { useResource } from '@/lib/api';
import { useColorScheme } from '@mui/joy/styles';

export function TextEditor({ node }: { node: FileNode }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { mode } = useColorScheme();
  const [content, setContent] = useState(node.data.content);
  const { update, isUpdating } = useResource(node.resourceName);

  useEffect(() => {
    setContent(node.data.content);
  }, [node]);

  return (
    <BaseEditor
      node={node}
      onUpdate={async () => {
        try {
          await update({
            updateKey: { key: 'content', subKey: node.fileName },
            operation: {
              name: 'change',
              target: node.data.content,
              to: content,
            },
          });
          dispatch(
            addNotification({
              message: t('saveFile.success'),
              type: 'success',
            }),
          );
        } catch (error) {
          dispatch(
            addNotification({
              message: error instanceof Error ? error.message : '',
              type: 'error',
            }),
          );
        }
      }}
      loading={isUpdating()}
    >
      <CodeMirror
        {...CODE_MIRROR_BASE_PROPS}
        theme={
          mode === 'dark' ? CODE_MIRROR_THEMES.dark : CODE_MIRROR_THEMES.light
        }
        readOnly={node.readOnly}
        value={content}
        onChange={(value) => setContent(value)}
      />
    </BaseEditor>
  );
}
