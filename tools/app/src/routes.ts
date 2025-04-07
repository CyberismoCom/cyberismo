import { createBrowserRouter, redirect } from 'react-router';
import CardsLayout from './pages/layout';
import CardsPage from './pages/cards';
import CardPage from './pages/card-view';
import CardEditPage from './pages/card-edit';

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
