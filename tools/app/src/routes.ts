import { createBrowserRouter, redirect } from 'react-router';
import CardsLayout from './pages/layout';
import CardsPage from './pages/cards';
import CardPage from './pages/card-view';
import CardEditPage from './pages/card-edit';

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
        loader: ({ params }) => createEditLoader(params.key!)(),
        Component: CardEditPage,
      },
    ],
  },
]);
