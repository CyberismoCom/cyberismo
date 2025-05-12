import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { createServer } from 'node:net';

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

export function createApp(projectPath?: string) {
  const app = new Hono();

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
    if (c.req.path.startsWith('/api')) {
      return c.text('Not Found', 400);
    }
    const file = await readFile(path.join(dirname, 'public', 'index.html'));
    return c.html(file.toString());
  });
  // Error handling
  app.onError((err, c) => {
    console.error(err.stack);
    return c.text('Internal Server Error', 500);
  });

  return app;
}

export async function startServer(
  projectPath?: string,
  findPort: boolean = true,
) {
  let port = parseInt(process.env.PORT || '3000', 10);

  if (findPort) {
    port = await findFreePort(port);
  }

  const app = createApp(projectPath);
  // Start server
  serve(
    {
      fetch: app.fetch,
      port: Number(port),
    },
    (info) => {
      console.log(`Running Cyberismo app on http://localhost:${info.port}`);
      console.log('Press Control+C to stop.');
    },
  );
}

async function findFreePort(
  port: number,
  maxAttempts: number = 100,
): Promise<number> {
  for (let i = port; i < port + maxAttempts; i++) {
    try {
      await testPort(i);
      return i;
    } catch (err) {
      if (err instanceof Error && err.message.includes('EADDRINUSE')) {
        console.log(`Port ${i} is already in use, trying next port...`);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to find free port');
}

function testPort(port: number) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(port, () => {
      server.close();
      resolve(true);
    });
    server.on('error', (err) => {
      reject(err);
    });
    setTimeout(() => {
      reject(new Error('Timed out waiting for port to be free'));
    }, 2000);
  });
}
