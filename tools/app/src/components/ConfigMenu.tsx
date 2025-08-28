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
import { useNavigate, useParams } from 'react-router';
import { findResourceNodeByName } from '@/lib/utils';

export default function ConfigMenu() {
  const { resourceTree } = useResourceTree();
  const { project } = useProject();

  const navigate = useNavigate();
  const { module, type, resource, file } = useParams();

  const selectedName =
    module && type && resource
      ? `${module}/${type}/${resource}${file ? `/${file}` : ''}`
      : null;
  const selectedId =
    selectedName && resourceTree
      ? findResourceNodeByName(resourceTree, selectedName)?.id
      : undefined;

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
        if (!node.data.name.includes('/')) {
          return;
        }
        navigate(`/configuration/${node.data.name}`);
      }}
    />
  );
}
