// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useResourceTree } from '@/lib/api';
import type { AnyNode, NodeKey, GenericNode } from '@/lib/api/types';
import { useParams } from 'react-router';
import {
  TextEditor,
  ResourceEditor,
  ConfigCardEditor,
} from '@/components/config-editors';
import { useTranslation } from 'react-i18next';
import { findResourceNodeByName } from '@/lib/utils';

type ResourceRendererMap = {
  [K in NodeKey]: (node: GenericNode<K>, key: string) => React.ReactNode;
};

const resourceMap: Partial<ResourceRendererMap> = {
  calculations: (node, key) => <ResourceEditor node={node} key={key} />,
  card: (node, key) => <ConfigCardEditor node={node} key={key} />,
  cardTypes: (node, key) => <ResourceEditor node={node} key={key} />,
  fieldTypes: (node, key) => <ResourceEditor node={node} key={key} />,
  file: (node, key) => <TextEditor node={node} key={key} />,
  graphModels: (node, key) => <ResourceEditor node={node} key={key} />,
  graphViews: (node, key) => <ResourceEditor node={node} key={key} />,
  linkTypes: (node, key) => <ResourceEditor node={node} key={key} />,
  reports: (node, key) => <ResourceEditor node={node} key={key} />,
  skills: (node, key) => <ResourceEditor node={node} key={key} />,
  templates: (node, key) => <ResourceEditor node={node} key={key} />,
  workflows: (node, key) => <ResourceEditor node={node} key={key} />,
};

function findNode(
  resourceTree: AnyNode[],
  module: string,
  type: string,
  resource: string,
  file?: string,
): AnyNode | null {
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

  const renderNode = <T extends NodeKey>(
    nodeType: T,
    nodeInstance: GenericNode<T>,
    key: string,
  ): React.ReactNode => {
    const renderer = resourceMap[nodeType];
    if (!renderer) {
      return <div>Type {nodeType} not implemented</div>;
    }
    return renderer(nodeInstance, key);
  };

  return renderNode(node.type, node, node.name);
}
