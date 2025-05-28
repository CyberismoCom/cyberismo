import { exportSite, startServer } from './index.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

if (process.argv.includes('--export')) {
  exportSite(process.env.npm_config_project_path || '');
} else {
  startServer(process.env.npm_config_project_path || '');
}
