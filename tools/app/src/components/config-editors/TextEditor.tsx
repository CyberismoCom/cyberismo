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
import { AnyNode } from '@/lib/api/types';
import { useResourceFileContent } from '@/lib/api';
import { useEffect, useState } from 'react';
import BaseEditor from './BaseEditor';
import { addNotification } from '@/lib/slices/notifications';
import { useAppDispatch } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { CODE_MIRROR_BASE_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import { useColorScheme } from '@mui/joy/styles';

export function TextEditor({ node }: { node: AnyNode }) {
  const { resourceFileContent, isLoading, updateFileContent, isUpdating } =
    useResourceFileContent(node.name);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { mode } = useColorScheme();
  const [content, setContent] = useState(resourceFileContent.content);

  useEffect(() => {
    setContent(resourceFileContent.content);
  }, [resourceFileContent]);

  if (isLoading) {
    return <div>Loading...</div>;
  }
  return (
    <BaseEditor
      node={node}
      onUpdate={async () => {
        try {
          await updateFileContent(content);
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
        theme={mode === 'dark' ? CODE_MIRROR_THEMES.dark : CODE_MIRROR_THEMES.light}
        readOnly={node.readOnly}
        value={content}
        onChange={(value) => setContent(value)}
      />
    </BaseEditor>
  );
}
