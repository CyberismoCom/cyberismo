import { createBrowserRouter, redirect } from 'react-router';
import CardsLayout from './cards/layout';
import CardsPage from './cards/page';
import CardPage from './cards/[key]/page';
import CardEditPage from './cards/[key]/edit/page';

// wrap all the routes in a cards layout
export const router = createBrowserRouter([
  {
    path: '/',
    loader: () => redirect('/cards'),
  },
  {
    Component: CardsLayout,
    children: [
      {
        path: '/cards',
        Component: CardsPage,
      },
      {
        path: '/cards/:key',
        Component: CardPage,
      },
      {
        path: '/cards/:key/edit',
        Component: CardEditPage,
      },
    ],
  },
]);
