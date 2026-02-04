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
import { useCallback, useEffect, useState } from 'react';
import BaseEditor from './BaseEditor';
import { addNotification } from '@/lib/slices/notifications';
import { isEdited } from '@/lib/slices/pageState';
import { useAppDispatch } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { CODE_MIRROR_CONFIG_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import { useResource } from '@/lib/api';
import { useIsDarkMode } from '@/lib/hooks';

export function TextEditor({ node }: { node: FileNode }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const isDarkMode = useIsDarkMode();
  const [content, setContent] = useState(node.data.content);

  const { update, isUpdating } = useResource(node.resourceName);

  const isDirty = content !== node.data.content;

  useEffect(() => {
    setContent(node.data.content);
  }, [node]);

  useEffect(() => {
    dispatch(isEdited(isDirty));
  }, [isDirty, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(isEdited(false));
    };
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    setContent(node.data.content);
    dispatch(isEdited(false));
  }, [node.data.content, dispatch]);

  return (
    <BaseEditor
      node={node}
      isDirty={isDirty}
      onCancel={handleCancel}
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
          dispatch(isEdited(false));
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
        {...CODE_MIRROR_CONFIG_PROPS}
        theme={isDarkMode ? CODE_MIRROR_THEMES.dark : CODE_MIRROR_THEMES.light}
        readOnly={node.readOnly}
        value={content}
        onChange={(value: string) => setContent(value)}
      />
    </BaseEditor>
  );
}
