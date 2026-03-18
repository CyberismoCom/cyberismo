import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    experimentalMemoryManagement: true,
    taskTimeout: 120000,
  },
});
