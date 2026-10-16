// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
