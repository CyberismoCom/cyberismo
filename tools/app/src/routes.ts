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
        Component: CardEditPage,
      },
    ],
  },
]);
