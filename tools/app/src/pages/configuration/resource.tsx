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
import { NodeType, ResourceNode, CalculationNode } from '@/lib/api/types';
import { useParams } from 'react-router';
import {
  TextEditor,
  ResourceEditor,
  ConfigCardEditor,
  CalculationEditor,
} from '@/components/config-editors';
import { useTranslation } from 'react-i18next';
import { findResourceNodeByName } from '@/lib/utils';

const resourceMap: Partial<
  Record<NodeType, (node: ResourceNode) => React.ReactNode>
> = {
  file: (node) => <TextEditor node={node} />,
  graphModels: (node) => <ResourceEditor node={node} />,
  graphViews: (node) => <ResourceEditor node={node} />,
  reports: (node) => <ResourceEditor node={node} />,
  templates: (node) => <ResourceEditor node={node} />,
  workflows: (node) => <ResourceEditor node={node} />,
  calculations: (node) => <CalculationEditor node={node as CalculationNode} />,
  cardTypes: (node) => <ResourceEditor node={node} />,
  fieldTypes: (node) => <ResourceEditor node={node} />,
  linkTypes: (node) => <ResourceEditor node={node} />,
  card: (node) => <ConfigCardEditor node={node} />,
};

function findNode(
  resourceTree: ResourceNode[],
  module: string,
  type: string,
  resource: string,
  file?: string,
): ResourceNode | null {
  const name = `${module}/${type}/${resource}${file ? `/${file}` : ''}`;
  return findResourceNodeByName(resourceTree, name);
}

export default function Resource() {
  const { resourceTree } = useResourceTree();
  const { module, type, resource, file } = useParams();
  const { t } = useTranslation();

  if (!resourceTree) {
    return <div>{t('loading')}</div>;
  }

  if (!module || !type || !resource) {
    return <div>{t('invalidResource')}</div>;
  }

  const node = findNode(resourceTree, module, type, resource, file);

  if (!node) {
    return (
      <div>
        Resource {module}/{type}/{resource}
        {file ? `/${file}` : ''} not found
      </div>
    );
  }

  const renderer = resourceMap[node.type];
  if (!renderer) {
    return <div>Type {node.type} not implemented</div>;
  }

  return renderer(node);
}
