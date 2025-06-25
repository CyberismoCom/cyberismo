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

import { useMemo } from 'react';
import { useResourceTree } from '@/lib/api';
import { BaseTreeComponent } from './BaseTreeComponent';
import { ConfigTreeNode } from './tree-nodes';
import { useProject } from '@/lib/api/project';
import type { ResourceNode } from '@/lib/api/resources';

// Helper function to add static child nodes to specific resource types
const addStaticChildren = (node: ResourceNode): ResourceNode => {
  if (!('data' in node)) {
    // Recursively process children for group nodes
    if (node.children) {
      return {
        ...node,
        children: node.children.map(addStaticChildren),
      };
    }
    return node;
  }

  const staticChildren: Array<{
    id: string;
    type: 'file';
    name: string;
    children?: never;
  }> = [];

  switch (node.type) {
    case 'reports':
      staticChildren.push(
        { id: `${node.id}-params`, type: 'file', name: 'Parameters schema' },
        { id: `${node.id}-query`, type: 'file', name: 'Query' },
        { id: `${node.id}-template`, type: 'file', name: 'Report template' },
      );
      break;

    case 'graphModels':
      staticChildren.push({
        id: `${node.id}-logic`,
        type: 'file',
        name: 'Model logic program',
      });
      break;

    case 'graphViews':
      staticChildren.push({
        id: `${node.id}-logic`,
        type: 'file',
        name: 'View logic program',
      });
      break;
  }

  if (staticChildren.length > 0) {
    return {
      ...node,
      children: [...(node.children || []), ...staticChildren],
    };
  }

  // Recursively process children for template nodes that might have card children
  if (node.children) {
    return {
      ...node,
      children: node.children.map(addStaticChildren),
    };
  }

  return node;
};

export default function ConfigMenu() {
  const { resourceTree } = useResourceTree();
  const { project } = useProject();

  // Preprocess the resource tree to add static children
  const processedResourceTree = useMemo(() => {
    if (!resourceTree) return null;
    return resourceTree.map(addStaticChildren);
  }, [resourceTree]);

  return (
    <BaseTreeComponent
      title={`Configuration - ${project?.name}`}
      linkTo="/configuration"
      data={processedResourceTree}
      nodeRenderer={ConfigTreeNode}
      idAccessor="id"
      childrenAccessor="children"
    />
  );
}
