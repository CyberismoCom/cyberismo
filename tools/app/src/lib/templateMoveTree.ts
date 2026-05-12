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

import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import type { AnyNode } from './api/types';

export const TEMPLATE_PREFIX = '__template__/';
export const PROJECT_ROOT_KEY = '__project_root__';

export function isTemplateContainerKey(key: string): boolean {
  return key.startsWith(TEMPLATE_PREFIX);
}

export function isProjectRootKey(key: string): boolean {
  return key === PROJECT_ROOT_KEY;
}

export function cardNodeToTreeResult(
  node: AnyNode,
): QueryResult<'tree'> | null {
  if (node.type !== 'card') return null;
  const data = node.data;
  const children = (node.children ?? [])
    .map((child) => cardNodeToTreeResult(child as AnyNode))
    .filter((child): child is QueryResult<'tree'> => child !== null);
  return {
    key: node.id,
    rank: data.metadata?.rank ?? '',
    title: data.metadata?.title ?? node.id,
    cardType: data.metadata?.cardType ?? '',
    children,
  };
}

// Walks the resource tree and collects only templates whose nearest ancestor
// module node is local (readOnly === false). Templates under an imported
// module are skipped because their cards are read-only.
export function collectLocalTemplateNodes(
  nodes: readonly AnyNode[] | undefined,
  templates: Extract<AnyNode, { type: 'templates' }>[],
  insideReadOnlyModule = false,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === 'module') {
      const readOnly = (node as { readOnly?: boolean }).readOnly === true;
      if ('children' in node && node.children) {
        collectLocalTemplateNodes(
          node.children,
          templates,
          insideReadOnlyModule || readOnly,
        );
      }
      continue;
    }
    if (node.type === 'templates') {
      if (!insideReadOnlyModule) {
        templates.push(node);
      }
      continue;
    }
    if ('children' in node && node.children) {
      collectLocalTemplateNodes(node.children, templates, insideReadOnlyModule);
    }
  }
}

export function buildTemplateMoveTree(
  resourceTree: readonly AnyNode[] | null | undefined,
): QueryResult<'tree'>[] {
  if (!resourceTree || resourceTree.length === 0) return [];
  const templates: Extract<AnyNode, { type: 'templates' }>[] = [];
  collectLocalTemplateNodes(resourceTree, templates);

  return templates.map((template) => ({
    key: `${TEMPLATE_PREFIX}${template.name}`,
    rank: '',
    title: template.name,
    cardType: '',
    children: (template.children ?? [])
      .map((child) => cardNodeToTreeResult(child as AnyNode))
      .filter((child): child is QueryResult<'tree'> => child !== null),
  }));
}

// Destinations tree used by MoveCardModal when the source card lives in the
// project (not in a template). Wraps the project tree under a single
// synthetic "project top level" node so the user can move a card to project
// root via the same selection mechanism templates use.
export function buildProjectDestinationsTree(
  projectTree: readonly QueryResult<'tree'>[] | null | undefined,
): QueryResult<'tree'>[] {
  return [
    {
      key: PROJECT_ROOT_KEY,
      rank: '',
      title: PROJECT_ROOT_KEY,
      cardType: '',
      children: projectTree ? [...projectTree] : [],
    },
  ];
}
