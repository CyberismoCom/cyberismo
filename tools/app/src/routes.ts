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
import Configuration from './pages/configuration/configuration';
import Resource from './pages/configuration/resource';
import General from './pages/configuration/general';
import ResourceOverviewPage from './pages/configuration/resource-overview';
import Layout from './pages/layout';
import ConfigLayout from './pages/configuration/layout';
import NotFoundPage from './pages/not-found';
import { isSafeRedirectPath } from './lib/utils.js';

// wrap all the routes in a cards layout
export const router = createBrowserRouter([
  {
    path: '/',
    loader: () => {
      if (window.location.search) {
        const newPath = window.location.search.slice(2).split('&')[0];
        if (newPath && isSafeRedirectPath(newPath)) {
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
            path: '/configuration/general',
            Component: General,
          },
          {
            path: '/configuration/:resourceType',
            Component: ResourceOverviewPage,
          },
          {
            path: '/configuration/:module/:type/:resource',
            Component: Resource,
          },
          {
            path: '/configuration/:module/:type/:resource/:file',
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
]);
