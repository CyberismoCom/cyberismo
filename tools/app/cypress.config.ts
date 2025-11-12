import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

// Path for test project that is created and modified during tests
const batPath = '../../.tmp/cyberismo-bat';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    experimentalMemoryManagement: true,
    setupNodeEvents(on) {
      on('task', {
        deleteTestProject() {
          rmSync(batPath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
          return null; // Return null instead of true to prevent EPIPE errors
        },
        createTestProject() {
          rmSync(batPath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
          // Create test project from test-module
          execSync(
            'cd ../../.tmp&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat --skipModuleImport&&cd cyberismo-bat&&cyberismo import module ../../module-test&&cyberismo create card test/templates/pageContent',
          );
          return null; // Return null instead of true to prevent EPIPE errors
        },
      });
    },
  },
});
