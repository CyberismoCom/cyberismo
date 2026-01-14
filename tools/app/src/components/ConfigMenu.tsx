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

import { useResourceTree } from '@/lib/api';
import { BaseTreeComponent } from './BaseTreeComponent';
import { ConfigTreeNode } from './tree-nodes';
import { useProject } from '@/lib/api/project';
import { useParams } from 'react-router';
import { findResourceNodeByName } from '@/lib/utils';
import { useAppRouter } from '@/lib/hooks';
import type { NodeApi } from 'react-arborist';
import type { AnyNode } from '@/lib/api/types';
import { RESOURCES } from '@/lib/constants';

function findAncestorResourceGroup(
  node: NodeApi<AnyNode>,
): Extract<AnyNode, { type: 'resourceGroup' }> | null {
  let current: NodeApi<AnyNode> | null = node.parent;
  while (current) {
    if (current.data.type === 'resourceGroup') return current.data;
    current = current.parent;
  }
  return null;
}

export default function ConfigMenu() {
  const { resourceTree } = useResourceTree();
  const { project } = useProject();

  const { module, type, resource, file, resourceType } = useParams();

  const selectedName = (() => {
    if (module && type && resource) {
      return `${module}/${type}/${resource}${file ? `/${file}` : ''}`;
    }
    if (resourceType) {
      return resourceType;
    }
    return null;
  })();
  const selectedId =
    selectedName && resourceTree
      ? findResourceNodeByName(resourceTree, selectedName)?.id
      : undefined;
  const { safePush } = useAppRouter();

  return (
    <BaseTreeComponent
      title={`Configuration - ${project?.name}`}
      linkTo="/configuration"
      data={resourceTree}
      nodeRenderer={ConfigTreeNode}
      selectedId={selectedId}
      idAccessor="id"
      childrenAccessor="children"
      onNodeClick={(node) => {
        if (node.data.type === 'general') {
          safePush('/configuration/general');
          return;
        }
        if (node.data.type === 'resourceGroup') {
          if ((RESOURCES as readonly string[]).includes(node.data.name)) {
            safePush(`/configuration/${node.data.name}`);
          }
          return;
        }
        if (node.data.type === 'module') {
          const group = findAncestorResourceGroup(node);
          if (group && (RESOURCES as readonly string[]).includes(group.name)) {
            safePush(
              `/configuration/${group.name}?modules=${encodeURIComponent(node.data.name)}`,
            );
          }
          return;
        }
        if (!node.data.name.includes('/')) {
          return;
        }
        safePush(`/configuration/${node.data.name}`);
      }}
    />
  );
}
