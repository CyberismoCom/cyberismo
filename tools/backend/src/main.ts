import { startServer } from './index.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

startServer(process.env.npm_config_project_path);
