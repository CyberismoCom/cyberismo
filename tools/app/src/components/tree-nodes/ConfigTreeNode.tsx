// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Typography } from '@mui/joy';
import type { NodeRendererProps, NodeApi } from 'react-arborist';
import { hasResourceData } from '@/lib/api/resources';
import type { AnyNode } from '@/lib/api/types';
import { useTranslation } from 'react-i18next';
import { BaseTreeNode } from './BaseTreeNode';

interface ConfigTreeNodeProps extends NodeRendererProps<AnyNode> {
  onNodeClick?: (node: NodeApi<AnyNode>) => void;
}

function identifier(name: string) {
  const parts = name.split('/');
  return parts[parts.length - 1];
}

function getResourceName(node: NodeApi<AnyNode>, t: (key: string) => string) {
  const resourceData = hasResourceData(node.data) ? node.data.data : null;
  if (node.data.type === 'module') {
    return node.data.name === 'project' ? t('project') : node.data.name;
  }
  if (node.data.type === 'general') {
    return t('general.title');
  }
  if (node.data.type === 'card') {
    return node.data.data.metadata?.title || node.data.data.key;
  }
  if (node.data.type === 'file') {
    return t(`configTree.files.${node.data.displayName}`);
  }
  if (node.data.type === 'resourceGroup') {
    return t(`resources.${node.data.name}`);
  }
  return resourceData?.displayName || identifier(node.data.name);
}

export const ConfigTreeNode = (props: ConfigTreeNodeProps) => {
  const { t } = useTranslation();
  const { node } = props;

  return (
    <BaseTreeNode {...props}>
      <Typography
        level="title-sm"
        noWrap
        alignSelf="center"
        sx={{ cursor: 'pointer' }}
      >
        {getResourceName(node, t)}
      </Typography>
    </BaseTreeNode>
  );
};
