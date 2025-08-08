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
import { ResourceNode } from '@/lib/api/types';
import { useResourceFileContent } from '@/lib/api';
import { useEffect, useState } from 'react';
import BaseEditor from './BaseEditor';

export function TextEditor({ node }: { node: ResourceNode }) {
  const { resourceFileContent, isLoading, updateFileContent, isUpdating } =
    useResourceFileContent(node.name);

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
      onUpdate={() => {
        updateFileContent(content);
      }}
      isUpdating={isUpdating()}
    >
      <CodeMirror
        basicSetup={{
          lineNumbers: false,
        }}
        style={{
          border: '1px solid',
          borderColor: 'rgba(0,0,0,0.23)',
          borderRadius: 4,
        }}
        value={content}
        onChange={(value) => setContent(value)}
      />
    </BaseEditor>
  );
}
