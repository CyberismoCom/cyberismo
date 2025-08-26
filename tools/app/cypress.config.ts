import { defineConfig } from 'cypress';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

// Path for test project that is created and modified during tests
const batPath = '../../.tmp/cyberismo-bat';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on) {
      on('task', {
        deleteTestProject() {
          rmSync(batPath, { recursive: true, force: true });
          return true;
        },
        createTestProject() {
          if (existsSync(batPath)) {
            rmSync(batPath, { recursive: true, force: true });
          }
          // Create test project from test-module
          execSync(
            'cd ../../.tmp&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat&&cd cyberismo-bat&&cyberismo import module ../../module-test&&cyberismo create card test/templates/pageContent',
          );
          return true;
        },
      });
    },
  },
});
