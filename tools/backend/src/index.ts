import express from 'express';
import cors from 'cors';
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

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export function startServer(projectPath?: string) {
  const app = express();
  const port = process.env.PORT || 3001;

  app.use(express.static(path.join(dirname, 'public')));

  app.use(cors());
  app.use(express.json());
  // Attach CommandManager to all requests
  app.use(attachCommandManager(projectPath));

  // Wire up routes
  app.use('/api/cards', cardsRouter);
  app.use('/api/cardTypes', cardTypesRouter);
  app.use('/api/fieldTypes', fieldTypesRouter);
  app.use('/api/linkTypes', linkTypesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/tree', treeRouter);

  // if anything else, serve the app
  app.use((req, res) => {
    res.sendFile(path.join(dirname, 'public', 'index.html'));
  });

  app.use(
    (
      err: Error,
      _: express.Request,
      res: express.Response,
      __: express.NextFunction,
    ) => {
      console.error(err.stack);
      res.status(500).send('Internal Server Error');
    },
  );
  // Start server
  app.listen(port, () => {
    console.log(`Express server running on port ${port}`);
  });
}
