import express from 'express';
import cors from 'cors';

import dotenv from 'dotenv';
import { attachCommandManager } from './middleware/commandManager.js';

// Import routes
import cardsRouter from './routes/cards.js';
import cardTypesRouter from './routes/cardTypes.js';
import fieldTypesRouter from './routes/fieldTypes.js';
import linkTypesRouter from './routes/linkTypes.js';
import templatesRouter from './routes/templates.js';
import treeRouter from './routes/tree.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
// Attach CommandManager to all requests
app.use(attachCommandManager);

// Wire up routes
app.use('/api/cards', cardsRouter);
app.use('/api/cardTypes', cardTypesRouter);
app.use('/api/fieldTypes', fieldTypesRouter);
app.use('/api/linkTypes', linkTypesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/tree', treeRouter);

// Start server
app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});
