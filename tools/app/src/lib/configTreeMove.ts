// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { AnyNode } from './api/types';
import { findTemplateForCard } from './hooks/utils';

export type ConfigTreeMoveRejectReason = 'invalidTarget' | 'moduleReadOnly';

export type ConfigTreeMoveResult =
  | { kind: 'noop' }
  | { kind: 'reject'; reason: ConfigTreeMoveRejectReason }
  | {
      kind: 'update';
      cardKey: string;
      update: { parent: string; index: number };
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
 * or an `update` with the parent and position to move the card to.
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

  const sourceTemplate = findTemplateForCard(resourceTree as AnyNode[], dragId);

  // Drop onto a templates node → move to that template's root.
  // A move to the card's own parent only reorders it.
  if (destParent.type === 'templates') {
    const destTemplateName = destParent.name;
    return {
      kind: 'update',
      cardKey: dragId,
      update: {
        parent:
          destTemplateName === sourceTemplate
            ? 'root'
            : `root:${destTemplateName}`,
        index,
      },
    };
  }

  // Drop onto a card.
  return {
    kind: 'update',
    cardKey: dragId,
    update: { parent: destParent.id, index },
  };
}
