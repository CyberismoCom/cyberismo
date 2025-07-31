import CodeMirror from '@uiw/react-codemirror';
import { ResourceNode } from '@/lib/api/types';
import { useResourceFileContent } from '@/lib/api';
import { useEffect, useState } from 'react';

export function TextEditor({ node }: { node: ResourceNode }) {
  const { resourceFileContent, isLoading } = useResourceFileContent(node.name);

  const [content, setContent] = useState(resourceFileContent.content);

  useEffect(() => {
    setContent(resourceFileContent.content);
  }, [resourceFileContent]);

  if (isLoading) {
    return <div>Loading...</div>;
  }
  return (
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
  );
}
