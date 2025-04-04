import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';

import { attachCommandManager } from './middleware/commandManager.js';

// Import routes
import cardsRouter from './routes/cards.js';
import cardTypesRouter from './routes/cardTypes.js';
import fieldTypesRouter from './routes/fieldTypes.js';
import linkTypesRouter from './routes/linkTypes.js';
import templatesRouter from './routes/templates.js';
import treeRouter from './routes/tree.js';

import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export function startServer(projectPath?: string) {
  const app = new Hono();
  const port = process.env.PORT || 3000;

  app.use('/api', cors());

  app.use(
    '*',
    serveStatic({
      root: path.relative(process.cwd(), path.resolve(dirname, 'public')),
    }),
  );

  // Attach CommandManager to all requests
  app.use(attachCommandManager(projectPath));

  // Wire up routes
  app.route('/api/cards', cardsRouter);
  app.route('/api/cardTypes', cardTypesRouter);
  app.route('/api/fieldTypes', fieldTypesRouter);
  app.route('/api/linkTypes', linkTypesRouter);
  app.route('/api/templates', templatesRouter);
  app.route('/api/tree', treeRouter);

  // serve index.html for all other routes
  app.notFound(async (c) => {
    const file = await readFile(path.join(dirname, 'public', 'index.html'));
    return c.html(file.toString());
  });
  // Error handling
  app.onError((err, c) => {
    console.error(err.stack);
    return c.text('Internal Server Error', 500);
  });
  // Start server
  serve(
    {
      fetch: app.fetch,
      port: Number(port),
    },
    (info) => {
      console.log(`Server running on port ${info.port}`);
    },
  );
}
