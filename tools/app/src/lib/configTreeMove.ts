/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { AnyNode } from './api/types';
import { findCardParentInResourceTree } from './utils';
import { findTemplateForCard } from './hooks/utils';

export type ConfigTreeMoveRejectReason = 'invalidTarget' | 'moduleReadOnly';

export type ConfigTreeMoveResult =
  | { kind: 'noop' }
  | { kind: 'reject'; reason: ConfigTreeMoveRejectReason }
  | {
      kind: 'update';
      cardKey: string;
      update: { parent?: string; index: number };
    };

export function findResourceNodeById(
  nodes: readonly AnyNode[] | undefined,
  id: string,
): AnyNode | null {
  if (!nodes) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findResourceNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

// Walks ancestors until we find the nearest 'module' node, returning whether
// that node is readOnly. Cards inside imported modules and templates inside
// imported modules both surface readOnly via the resource-tree shape produced
// by tools/backend/src/domain/resources/service.ts.
function isUnderReadOnlyModule(
  nodes: readonly AnyNode[],
  targetId: string,
): boolean {
  function walk(node: AnyNode, ancestors: AnyNode[]): boolean | null {
    if (node.id === targetId) {
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const anc = ancestors[i];
        if (anc.type === 'module') {
          return (anc as { readOnly?: boolean }).readOnly === true;
        }
      }
      return (node as { readOnly?: boolean }).readOnly === true;
    }
    if ('children' in node && node.children) {
      for (const child of node.children) {
        const result = walk(child as AnyNode, [...ancestors, node]);
        if (result !== null) return result;
      }
    }
    return null;
  }
  for (const root of nodes) {
    const result = walk(root, []);
    if (result !== null) return result;
  }
  return false;
}

/**
 * Decides what to do with a drag-and-drop in the configuration tree.
 * Returns a `noop` for non-card drags, a `reject` (with a reason for a toast),
 * or an `update` payload describing the PATCH to send to /api/cards/:key.
 */
export function resolveConfigTreeMove(
  resourceTree: readonly AnyNode[] | null | undefined,
  dragId: string,
  parentId: string | null,
  index: number,
): ConfigTreeMoveResult {
  if (!resourceTree) return { kind: 'noop' };

  const dragged = findResourceNodeById(resourceTree, dragId);
  if (!dragged || dragged.type !== 'card') return { kind: 'noop' };

  if (!parentId) {
    return { kind: 'reject', reason: 'invalidTarget' };
  }

  const destParent = findResourceNodeById(resourceTree, parentId);
  if (
    !destParent ||
    (destParent.type !== 'card' && destParent.type !== 'templates')
  ) {
    return { kind: 'reject', reason: 'invalidTarget' };
  }

  // Imported modules are read-only on both ends.
  if (
    isUnderReadOnlyModule(resourceTree, dragId) ||
    isUnderReadOnlyModule(resourceTree, parentId)
  ) {
    return { kind: 'reject', reason: 'moduleReadOnly' };
  }

  const writableResourceTree = resourceTree as AnyNode[];
  const sourceTemplate = findTemplateForCard(writableResourceTree, dragId);

  // Drop onto a templates node → move to that template's root.
  if (destParent.type === 'templates') {
    const destTemplateName = destParent.name;
    const currentParentForRootCheck = findCardParentInResourceTree(
      writableResourceTree,
      dragId,
    );
    const alreadyAtSourceTemplateRoot =
      currentParentForRootCheck?.type === 'templates';
    if (destTemplateName === sourceTemplate) {
      if (alreadyAtSourceTemplateRoot) {
        // Already a root card of this template — just reorder.
        return { kind: 'update', cardKey: dragId, update: { index } };
      }
      return {
        kind: 'update',
        cardKey: dragId,
        update: { parent: 'root', index },
      };
    }
    return {
      kind: 'update',
      cardKey: dragId,
      update: { parent: `root:${destTemplateName}`, index },
    };
  }

  // Drop onto a card.
  const currentParent = findCardParentInResourceTree(
    writableResourceTree,
    dragId,
  );
  const currentParentKey =
    currentParent?.type === 'card' ? currentParent.id : undefined;
  const newParentKey = destParent.id;

  if (newParentKey === currentParentKey) {
    return { kind: 'update', cardKey: dragId, update: { index } };
  }
  return {
    kind: 'update',
    cardKey: dragId,
    update: { parent: newParentKey, index },
  };
}
