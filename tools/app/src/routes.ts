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
import Layout from './pages/layout';
import ConfigLayout from './pages/configuration/layout';

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

// wrap all the routes in a cards layout
export const router = createBrowserRouter([
  {
    path: '/',
    loader: () => {
      if (window.location.search) {
        const newPath = window.location.search.slice(2).split('&')[0];
        if (newPath) {
          return redirect(newPath);
        }
      }
      return redirect('/cards');
    },
  },
  {
    Component: Layout,
    children: [
      {
        Component: CardsLayout,
        children: [
          {
            path: '/cards.html',
            loader: () => redirect('/cards'),
          },
          {
            path: '/cards',
            Component: CardsPage,
          },
          {
            path: '/cards/:key.html',
            loader: ({ params }) => {
              return redirect(`/cards/${params.key}`);
            },
          },
          {
            path: '/cards/:key',
            Component: CardPage,
          },
          {
            path: '/cards/:key/edit.html',
            loader: ({ params }) => {
              return redirect(`/cards/${params.key}/edit`);
            },
          },
          {
            path: '/cards/:key/edit',
            loader: ({ params }) => createEditLoader(params.key!)(),
            Component: CardEditPage,
          },
        ],
      },
      {
        Component: ConfigLayout,
        children: [
          {
            path: '/configuration/',
            Component: Configuration,
          },
          {
            path: '/configuration/:resource',
            Component: Resource,
          },
        ],
      },
    ],
  },
]);
