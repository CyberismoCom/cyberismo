/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Outlet, useParams } from 'react-router';
import TwoColumnLayout from '../../components/TwoColumnLayout';
import ConfigMenu from '../../components/ConfigMenu';
import { useDocumentTitle } from '../../lib/hooks';
import { useProject } from '../../lib/api';

export default function ConfigLayout() {
  // TODO: resource is not implemented yet, might need to change this
  const { resource, resourceType } = useParams();
  const { project } = useProject();

  const title =
    resource && project?.name
      ? `${resource} - ${project.name}`
      : resourceType && project?.name
        ? `${resourceType} - ${project.name}`
        : project?.name || 'Cyberismo App';
  useDocumentTitle(title);

  return <TwoColumnLayout leftPanel={<ConfigMenu />} rightPanel={<Outlet />} />;
}
