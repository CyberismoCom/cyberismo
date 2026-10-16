// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useResourceTree } from '@/lib/api';
import { BaseTreeComponent } from './BaseTreeComponent';
import { ConfigTreeNode } from './tree-nodes';
import { useProject } from '@/lib/api/project';
import { useParams } from 'react-router';
import { findResourceNodeByName } from '@/lib/utils';
import { useAppRouter } from '@/lib/hooks';
import { resolveConfigTreeMove } from '@/lib/configTreeMove';
import { addNotification } from '@/lib/slices/notifications';
import { UserRole, useHasMinRole } from '@/lib/auth';
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
  const { project, updateCard } = useProject();
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const { module, type, resource, file, resourceType, projectPrefix } =
    useParams();

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
  const { push } = useAppRouter();
  const isAdmin = useHasMinRole(UserRole.Admin);

  const handleMove = useCallback(
    async (dragIds: string[], parentId: string | null, index: number) => {
      if (dragIds.length !== 1) return;
      const result = resolveConfigTreeMove(
        resourceTree,
        dragIds[0],
        parentId,
        index,
      );
      if (result.kind === 'noop') return;
      if (result.kind === 'reject') {
        dispatch(
          addNotification({
            message: t(`configMove.${result.reason}`),
            type: 'error',
          }),
        );
        return;
      }
      try {
        await updateCard(result.cardKey, result.update);
      } catch (error) {
        dispatch(
          addNotification({
            message: error instanceof Error ? error.message : '',
            type: 'error',
          }),
        );
      }
    },
    [resourceTree, updateCard, dispatch, t],
  );

  return (
    <BaseTreeComponent
      title={`Configuration - ${project?.name}`}
      linkTo="/configuration"
      onBackClick={() => push(`/projects/${projectPrefix}/cards`)}
      backLabel={t('configTree.backToCards')}
      data={resourceTree}
      nodeRenderer={ConfigTreeNode}
      selectedId={selectedId}
      idAccessor="id"
      childrenAccessor="children"
      onMove={handleMove}
      readOnly={!isAdmin}
      onNodeClick={(node) => {
        if (node.data.type === 'general') {
          push('/configuration/general');
          return;
        }
        if (node.data.type === 'resourceGroup') {
          if ((RESOURCES as readonly string[]).includes(node.data.name)) {
            push(`/configuration/${node.data.name}`);
          }
          return;
        }
        if (node.data.type === 'module') {
          const group = findAncestorResourceGroup(node);
          if (group && (RESOURCES as readonly string[]).includes(group.name)) {
            push(
              `/configuration/${group.name}?modules=${encodeURIComponent(node.data.name)}`,
            );
          }
          return;
        }
        if (!node.data.name.includes('/')) {
          return;
        }
        push(`/configuration/${node.data.name}`);
      }}
    />
  );
}
