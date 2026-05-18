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
import { createBrowserRouter, redirect } from 'react-router';
import CardsLayout from './pages/cards/layout';
import CardsPage from './pages/cards/cards';
import CardPage from './pages/cards/card-view';
import CardEditPage from './pages/cards/card-edit';
import Configuration from './pages/configuration/configuration';
import Resource from './pages/configuration/resource';
import General from './pages/configuration/general';
import ResourceOverviewPage from './pages/configuration/resource-overview';
import Layout from './pages/layout';
import ConfigLayout from './pages/configuration/layout';
import NotFoundPage from './pages/not-found';
import ProjectNotFoundPage from './pages/project-not-found';
import ProjectSelectionPage from './pages/ProjectSelectionPage';
import { store } from './lib/store.js';
import {
  selectProjectPrefix,
  setProjectPrefix,
  addRecentProject,
} from './lib/slices/project.js';
import { fetchAvailableProjects } from './lib/projectUtils.js';
import type { AvailableProject } from './lib/projectUtils.js';
import { getConfig } from './lib/utils.js';

// Export mode guard - unfortunately need to refetch config.json to check export mode since hooks
function createEditLoader(cardKey: string) {
  return async () => {
    // Check if we're in export mode via environment variable
    if (import.meta.env.VITE_CYBERISMO_EXPORT === 'true') {
      return redirect(`/cards/${cardKey}`);
    }

    // Try to fetch config.json to check export mode
    try {
      const response = await fetch('/config.json');
      if (response.ok) {
        const config = await response.json();
        if (config.staticMode === true) {
          return redirect(`/cards/${cardKey}`);
        }
      }
    } catch (error) {
      // If config.json fails to load, assume not in export mode
      console.warn('Failed to load config.json for export mode check:', error);
    }

    return null; // Allow normal routing
  };
}

// Resolve which project to use: try the given prefix first, then persisted, then first available
async function resolveProject(urlPrefix?: string) {
  const projects = await fetchAvailableProjects().catch(
    () => [] as AvailableProject[],
  );
  const prefixes = projects.map((p) => p.prefix);
  const lastActive = selectProjectPrefix(store.getState());

  // If there's only one project, use it directly without requiring user selection
  const fallbackPrefix = prefixes.length === 1 ? prefixes[0] : undefined;

  const configDefault = getConfig().defaultProject;
  const candidates = [urlPrefix, configDefault, lastActive, fallbackPrefix];
  const prefix = candidates.find((c) => c && prefixes.includes(c));

  if (prefix) {
    store.dispatch(setProjectPrefix(prefix));
    store.dispatch(addRecentProject(prefix));
  }

  return { prefix, projects };
}

// wrap all the routes in a cards layout
export function createAppRouter() {
  return createBrowserRouter([
    {
      path: '/',
      loader: async () => {
        const { prefix } = await resolveProject();
        if (prefix) return redirect(`/projects/${prefix}/cards`);
        // No prefix resolved — show project selection page
        return null;
      },
      Component: ProjectSelectionPage,
    },
    {
      path: '/projects/:projectPrefix',
      Component: Layout,
      ErrorBoundary: ProjectNotFoundPage,
      loader: async ({ params }) => {
        const { prefix } = await resolveProject(params.projectPrefix);
        if (prefix === params.projectPrefix) return null;
        throw new Response('Project not found', { status: 404 });
      },
      children: [
        {
          index: true,
          loader: () => redirect('cards'),
        },
        {
          Component: CardsLayout,
          children: [
            {
              path: 'cards.html',
              loader: () => redirect('cards'),
            },
            {
              path: 'cards',
              Component: CardsPage,
            },
            {
              path: 'cards/:key.html',
              loader: ({ params }) => {
                return redirect(
                  `/projects/${params.projectPrefix}/cards/${params.key}`,
                );
              },
            },
            {
              path: 'cards/:key',
              Component: CardPage,
            },
            {
              path: 'cards/:key/edit.html',
              loader: ({ params }) => {
                return redirect(
                  `/projects/${params.projectPrefix}/cards/${params.key}/edit`,
                );
              },
            },
            {
              path: 'cards/:key/edit',
              loader: ({ params }) => createEditLoader(params.key!)(),
              Component: CardEditPage,
            },
          ],
        },
        {
          Component: ConfigLayout,
          children: [
            {
              path: 'configuration/',
              Component: Configuration,
            },
            {
              path: 'configuration/general',
              Component: General,
            },
            {
              path: 'configuration/:resourceType',
              Component: ResourceOverviewPage,
            },
            {
              path: 'configuration/:module/:type/:resource',
              Component: Resource,
            },
            {
              path: 'configuration/:module/:type/:resource/:file',
              Component: Resource,
            },
          ],
        },
        {
          path: '*',
          Component: NotFoundPage,
        },
      ],
    },
    {
      // Catch legacy URLs without /projects/ prefix (e.g. /cards/KEY, /configuration/...)
      path: '*',
      loader: async ({ request }) => {
        const active = selectProjectPrefix(store.getState());
        const prefix = active ?? (await resolveProject()).prefix;
        const url = new URL(request.url);
        if (prefix) {
          return redirect(`/projects/${prefix}${url.pathname}`);
        }
        return redirect('/');
      },
    },
  ]);
}
